import { pool } from "./db.js";
import { getPrice } from "./pricing.js";
import { extractTxHash, prepareUsdcPayment, submitPreparedPayment } from "./settlement.js";

const EMIT_INTERVAL_MS = 4000;
const UNIT_TYPE = "water";
const MIN_QUANTITY = 0.2;
const MAX_QUANTITY = 2.2;
const CURRENCY = "USDC";

/**
 * Settlement round-trips run longer than the emit interval, so settling one at a
 * time throttles throughput to the latency of the facilitator rather than the
 * rate of usage. A small fixed pool overlaps them without flooding the
 * facilitator or tripping rate limits.
 *
 * This is safe because the spending-limit reservation below is applied
 * synchronously, before the first await, so concurrent settlements cannot race
 * past the limit. Nonces carry no shared state either: each attempt signs its
 * own 32 random bytes, so concurrent authorizations cannot collide.
 */
const MAX_CONCURRENT_SETTLEMENTS = 4;

/**
 * How many settlements may fail back to back before the session is given up on.
 *
 * A facilitator that has rejected the last five authorizations is not having a
 * blip, and continuing to ask produces nothing but load: each attempt writes a
 * usage row and a settlement row, so an unattended session previously grew the
 * database by two rows every four seconds for as long as the process survived.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Delay before the next attempt once failures start, doubling each time and
 * capped. This is applied on top of the emit interval by holding the feed back
 * rather than by changing the timer, so the healthy emit rate is untouched.
 */
const FAILURE_BACKOFF_BASE_MS = 8_000;
const FAILURE_BACKOFF_MAX_MS = 120_000;

interface ActiveFeed {
  timer: NodeJS.Timeout;
  spendingLimit: number;
  /** Spend reserved against the limit, including settlements still in flight. */
  committedTotal: number;
  /** Number of settlements currently in flight, capped at MAX_CONCURRENT_SETTLEMENTS. */
  inFlight: number;
  /** Settlement failures since the last confirmed one, reset by any success. */
  consecutiveFailures: number;
  /** Epoch ms before which no further attempt is made, moved forward by backoff. */
  nextAttemptAt: number;
  /** Set while the feed is being torn down, so in-flight callbacks stop acting. */
  stopping: boolean;
}

const activeFeeds = new Map<string, ActiveFeed>();

function randomQuantity(): number {
  const value = MIN_QUANTITY + Math.random() * (MAX_QUANTITY - MIN_QUANTITY);
  return Number(value.toFixed(2));
}

async function endSession(sessionId: string, status: string): Promise<void> {
  stopFeed(sessionId);
  try {
    await pool.query(
      `update sessions
       set status = $2, ended_at = now()
       where id = $1 and status = 'active'`,
      [sessionId, status]
    );
  } catch (err) {
    console.error(`usage feed: failed to mark session ${sessionId} as ${status}`, err);
  }
}

async function endSessionAtLimit(sessionId: string): Promise<void> {
  await endSession(sessionId, "limit_reached");
}

/**
 * Records the outcome of one settlement attempt against the session's failure
 * budget. A confirmed settlement clears the count; repeated failures back off
 * and then stop the session for good rather than retrying it forever.
 */
function recordOutcome(sessionId: string, settled: boolean): void {
  const feed = activeFeeds.get(sessionId);
  if (!feed || feed.stopping) return;

  if (settled) {
    feed.consecutiveFailures = 0;
    feed.nextAttemptAt = 0;
    return;
  }

  feed.consecutiveFailures += 1;

  if (feed.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    // Marked before the await so concurrent in-flight failures cannot each
    // start their own teardown.
    feed.stopping = true;
    console.error(
      `usage feed: session ${sessionId} stopped after ${feed.consecutiveFailures} ` +
        `consecutive settlement failures, not retrying further`
    );
    void endSession(sessionId, "settlement_failed");
    return;
  }

  const backoff = Math.min(
    FAILURE_BACKOFF_BASE_MS * 2 ** (feed.consecutiveFailures - 1),
    FAILURE_BACKOFF_MAX_MS
  );
  feed.nextAttemptAt = Date.now() + backoff;
  console.warn(
    `usage feed: session ${sessionId} settlement failure ` +
      `${feed.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}, ` +
      `next attempt in ${Math.round(backoff / 1000)}s`
  );
}

/**
 * Emits one discrete usage event and settles it for real on Celo mainnet.
 *
 * The usage row is written before settlement is attempted, and the settlement
 * row is written in 'pending' state before the network call, so a failed or
 * crashed settlement can never hide the fact that usage occurred.
 */
async function emitEvent(sessionId: string): Promise<void> {
  const feed = activeFeeds.get(sessionId);
  if (!feed || feed.stopping || feed.inFlight >= MAX_CONCURRENT_SETTLEMENTS) return;

  // Held back after a failure, so a failing session stops writing a usage row
  // and a settlement row on every tick while it waits.
  if (Date.now() < feed.nextAttemptAt) return;

  const quantity = randomQuantity();
  const amount = Number(getPrice(UNIT_TYPE, quantity).toFixed(6));

  if (amount <= 0) {
    console.error(`usage feed: computed non-positive amount for session ${sessionId}, skipping`);
    return;
  }

  // Stop before spending rather than after, so the session can never exceed the
  // limit the user set. This check and the reservation below both run
  // synchronously, with no await between them, so concurrent settlements are
  // each reserved against the limit before any of them can start.
  if (feed.committedTotal + amount > feed.spendingLimit) {
    await endSessionAtLimit(sessionId);
    return;
  }

  feed.committedTotal += amount;
  feed.inFlight += 1;

  let usageEventId: string;
  let settlementId: string;
  let prepared: Awaited<ReturnType<typeof prepareUsdcPayment>>;

  try {
    const usageResult = await pool.query(
      `insert into usage_events (session_id, unit_type, quantity, occurred_at)
       values ($1, $2, $3, now())
       returning id`,
      [sessionId, UNIT_TYPE, quantity]
    );
    usageEventId = usageResult.rows[0].id;

    // Sign first so the authorization exists, then persist its authorizer and
    // nonce before the settlement is submitted. If the process dies mid-flight,
    // the reconciler can still resolve this payment definitively on-chain.
    prepared = await prepareUsdcPayment({
      amountUsdc: amount,
      description: `Tapa ${UNIT_TYPE} usage, ${quantity} units`,
      // Ties each settlement to the exact usage event that caused it.
      resource: `https://tapa.app/usage/${usageEventId}`,
    });

    const settlementResult = await pool.query(
      `insert into settlements (usage_event_id, amount, currency, status, authorizer, nonce)
       values ($1, $2, $3, 'pending', $4, $5)
       returning id`,
      [
        usageEventId,
        amount,
        CURRENCY,
        prepared.authorization.from,
        prepared.authorization.nonce,
      ]
    );
    settlementId = settlementResult.rows[0].id;
  } catch (err) {
    console.error(`usage feed: failed to record event for session ${sessionId}`, err);
    feed.committedTotal -= amount;
    feed.inFlight -= 1;
    return;
  }

  try {
    const result = await submitPreparedPayment("settle", prepared);
    const txHash = extractTxHash(result.raw);

    const raw = result.raw as { success?: boolean; errorReason?: string; errorMessage?: string };
    const settled = result.ok && raw?.success === true && Boolean(txHash);

    if (settled) {
      await pool.query(
        `update settlements
         set status = 'confirmed', tx_hash = $2, settled_at = now()
         where id = $1`,
        [settlementId, txHash]
      );
    } else {
      await pool.query(
        `update settlements set status = 'failed' where id = $1`,
        [settlementId]
      );
      console.error(
        `usage feed: settlement failed for session ${sessionId}`,
        raw?.errorReason ?? `HTTP ${result.status}`,
        raw?.errorMessage ?? ""
      );

      // Nothing was spent, so the reservation goes back to the session's budget.
      // This previously keyed off success:false alone, which meant a rejection
      // shaped any other way, such as a bare 402 body, silently consumed the
      // user's spending limit without ever moving any USDC.
      const definitelyNotSettled = raw?.success === false || (!result.ok && !txHash);
      if (definitelyNotSettled) {
        const current = activeFeeds.get(sessionId);
        if (current) current.committedTotal = Math.max(0, current.committedTotal - amount);
      }
    }

    recordOutcome(sessionId, settled);
  } catch (err) {
    // Outcome genuinely unknown, the request may have settled before the error.
    // Deliberately leave the row 'pending' rather than guessing 'failed': the
    // authorizer and nonce are already persisted, so the reconciler can resolve
    // it definitively on-chain. Keep the reservation meanwhile, so an
    // unresolved payment can never push the session past the user's limit.
    console.error(
      `usage feed: settlement threw for session ${sessionId}, left pending for reconciliation`,
      err
    );

    // Counted as a failure too. A facilitator that is unreachable or timing out
    // every time is exactly the case that used to retry until the process died.
    recordOutcome(sessionId, false);
  } finally {
    // Released against the live feed rather than the captured reference, so a
    // session that ended mid-flight does not resurrect stale counters.
    const current = activeFeeds.get(sessionId);
    if (current) current.inFlight -= 1;
  }
}

export function startFeed(sessionId: string, spendingLimit: number): void {
  if (activeFeeds.has(sessionId)) return;
  const timer = setInterval(() => {
    // emitEvent computes the price before its own try block, and getPrice throws
    // on an unconfigured or malformed rate. Unhandled, that rejection would take
    // the whole process down on every tick, so the floating promise is caught
    // here rather than left to the default handler.
    emitEvent(sessionId).catch((err) => {
      console.error(`usage feed: emit failed for session ${sessionId}`, err);
      recordOutcome(sessionId, false);
    });
  }, EMIT_INTERVAL_MS);
  activeFeeds.set(sessionId, {
    timer,
    spendingLimit,
    committedTotal: 0,
    inFlight: 0,
    consecutiveFailures: 0,
    nextAttemptAt: 0,
    stopping: false,
  });
}

export function stopFeed(sessionId: string): void {
  const feed = activeFeeds.get(sessionId);
  if (feed) {
    feed.stopping = true;
    clearInterval(feed.timer);
    activeFeeds.delete(sessionId);
  }
}

/**
 * Stops every feed, so a shutting down process does not leave timers firing
 * against a closing database pool during the drain window.
 */
export function stopAllFeeds(): void {
  for (const sessionId of [...activeFeeds.keys()]) {
    stopFeed(sessionId);
  }
}

export function isFeedActive(sessionId: string): boolean {
  return activeFeeds.has(sessionId);
}

/**
 * Applies a new spending limit to a running feed, so a change takes effect on
 * the next tick rather than only after a restart. Spend already committed is
 * left untouched: lowering the limit below it simply stops further settlement.
 */
export function updateFeedLimit(sessionId: string, spendingLimit: number): void {
  const feed = activeFeeds.get(sessionId);
  if (feed) feed.spendingLimit = spendingLimit;
}
