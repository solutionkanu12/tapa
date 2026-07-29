import { pool } from "./db";
import { getPrice } from "./pricing";
import { extractTxHash, prepareUsdcPayment, submitPreparedPayment } from "./settlement";

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

interface ActiveFeed {
  timer: NodeJS.Timeout;
  spendingLimit: number;
  /** Spend reserved against the limit, including settlements still in flight. */
  committedTotal: number;
  /** Number of settlements currently in flight, capped at MAX_CONCURRENT_SETTLEMENTS. */
  inFlight: number;
}

const activeFeeds = new Map<string, ActiveFeed>();

function randomQuantity(): number {
  const value = MIN_QUANTITY + Math.random() * (MAX_QUANTITY - MIN_QUANTITY);
  return Number(value.toFixed(2));
}

async function endSessionAtLimit(sessionId: string): Promise<void> {
  stopFeed(sessionId);
  try {
    await pool.query(
      `update sessions
       set status = 'limit_reached', ended_at = now()
       where id = $1 and status = 'active'`,
      [sessionId]
    );
  } catch (err) {
    console.error(`usage feed: failed to mark session ${sessionId} as limit_reached`, err);
  }
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
  if (!feed || feed.inFlight >= MAX_CONCURRENT_SETTLEMENTS) return;

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

      // The facilitator explicitly reported no settlement, so nothing was spent
      // and the reservation can be safely returned to the session's budget.
      if (raw?.success === false) {
        feed.committedTotal -= amount;
      }
    }
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
    void emitEvent(sessionId);
  }, EMIT_INTERVAL_MS);
  activeFeeds.set(sessionId, { timer, spendingLimit, committedTotal: 0, inFlight: 0 });
}

export function stopFeed(sessionId: string): void {
  const feed = activeFeeds.get(sessionId);
  if (feed) {
    clearInterval(feed.timer);
    activeFeeds.delete(sessionId);
  }
}

export function isFeedActive(sessionId: string): boolean {
  return activeFeeds.has(sessionId);
}
