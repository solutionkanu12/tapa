/**
 * Proves that a session whose settlements keep failing stops retrying.
 *
 * Runs the real usage feed against a stubbed facilitator and a stubbed database,
 * so it spends nothing and needs no network or Postgres. The feed's interval
 * callback is captured rather than scheduled and the clock is virtual, so the
 * whole run is deterministic and finishes immediately instead of taking the
 * two minutes the real backoff would.
 *
 * The facilitator stub answers /settle with a bare HTTP 402 carrying no
 * success field, which is the exact shape that used to leave the reservation
 * committed and let the loop run for an hour.
 */

// Set before anything imports dotenv, which does not overwrite existing values.
process.env.DATABASE_URL = "postgres://stub:stub@127.0.0.1:5432/stub";
process.env.PAYER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
process.env.X402_PAYTO_WALLET = "0x4c585c153bcd58b3fc94515b6cd7f1d4add9bdb0";
process.env.X402_API_KEY = "stub-key";
process.env.API_SHARED_SECRET = "stub-secret";

const EXPECTED_EMIT_INTERVAL_MS = 4000;
const EXPECTED_MAX_FAILURES = 5;

const realSetTimeout = globalThis.setTimeout;
const drain = () => new Promise((resolve) => realSetTimeout(resolve, 5));

// ---- virtual clock -------------------------------------------------------
const realDateNow = Date.now;
let virtualNow = realDateNow();
Date.now = () => virtualNow;

// ---- captured interval ---------------------------------------------------
let tick: (() => void) | null = null;
let intervalMs = 0;
let cleared = false;

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).setInterval = (fn: () => void, ms: number) => {
  tick = fn;
  intervalMs = ms;
  return { unref: () => undefined } as unknown as NodeJS.Timeout;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).clearInterval = () => {
  cleared = true;
};

// ---- facilitator stub ----------------------------------------------------
const settleAttempts: number[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = async (input: string | URL) => {
  const url = String(input);
  if (url.endsWith("/supported")) {
    return new Response(JSON.stringify({ kinds: [{ network: "celo" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.endsWith("/settle")) {
    settleAttempts.push(virtualNow);
    // Bare 402, no success field, which is what the live facilitator returned.
    return new Response(JSON.stringify({ error: "payment required" }), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`unexpected fetch in test: ${url}`);
};

// ---- database stub -------------------------------------------------------
interface Recorded {
  usageEvents: number;
  settlements: number;
  failedMarks: number;
  sessionStatus: string | null;
}
const recorded: Recorded = {
  usageEvents: 0,
  settlements: 0,
  failedMarks: 0,
  sessionStatus: null,
};

let uid = 0;

async function main(): Promise<void> {
  const { pool } = await import("../db.js");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (text: string, params?: unknown[]) => {
    if (text.includes("insert into usage_events")) {
      recorded.usageEvents += 1;
      return { rows: [{ id: `usage-${++uid}` }], rowCount: 1 };
    }
    if (text.includes("insert into settlements")) {
      recorded.settlements += 1;
      return { rows: [{ id: `settle-${++uid}` }], rowCount: 1 };
    }
    if (text.includes("update settlements set status = 'failed'")) {
      recorded.failedMarks += 1;
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("update sessions")) {
      recorded.sessionStatus = String(params?.[1] ?? "");
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const { startFeed, isFeedActive } = await import("../usageFeed.js");

  const sessionId = "test-session";
  // Deliberately generous, so nothing here can be mistaken for the spending
  // limit stopping the session instead of the retry limit.
  startFeed(sessionId, 1000);

  if (intervalMs !== EXPECTED_EMIT_INTERVAL_MS) {
    throw new Error(
      `expected the feed to tick every ${EXPECTED_EMIT_INTERVAL_MS}ms, got ${intervalMs}ms`
    );
  }
  if (!tick) throw new Error("feed did not register an interval callback");

  // Drive far more ticks than the failure budget allows. A feed that never gives
  // up would attempt a settlement on almost all of them.
  const TICKS = 400;
  for (let i = 0; i < TICKS; i++) {
    tick();
    await drain();
    virtualNow += EXPECTED_EMIT_INTERVAL_MS;
  }

  const gaps = settleAttempts
    .slice(1)
    .map((t, i) => Math.round((t - settleAttempts[i]) / 1000));

  console.log("=== result ===");
  console.log("ticks driven                :", TICKS);
  console.log("settle attempts             :", settleAttempts.length);
  console.log("gaps between attempts (s)   :", gaps.join(", "));
  console.log("usage_events inserted       :", recorded.usageEvents);
  console.log("settlements inserted        :", recorded.settlements);
  console.log("settlements marked failed   :", recorded.failedMarks);
  console.log("session status written      :", recorded.sessionStatus);
  console.log("interval cleared            :", cleared);
  console.log("feed still active           :", isFeedActive(sessionId));

  const failures: string[] = [];

  if (settleAttempts.length !== EXPECTED_MAX_FAILURES) {
    failures.push(
      `expected exactly ${EXPECTED_MAX_FAILURES} settle attempts, got ${settleAttempts.length}`
    );
  }
  if (!cleared) failures.push("the feed interval was never cleared");
  if (isFeedActive(sessionId)) failures.push("the feed is still registered as active");
  if (recorded.sessionStatus !== "settlement_failed") {
    failures.push(`expected session status settlement_failed, got ${recorded.sessionStatus}`);
  }
  if (recorded.sessionStatus === "limit_reached") {
    failures.push("session ended on the spending limit, not the retry limit");
  }
  if (recorded.usageEvents !== EXPECTED_MAX_FAILURES) {
    failures.push(
      `expected ${EXPECTED_MAX_FAILURES} usage rows, got ${recorded.usageEvents}: ` +
        `a failing session is still writing rows every tick`
    );
  }
  // 4s for the first attempt, then the backoff doubling from 8s.
  const expectedGaps = [8, 16, 32, 64];
  if (gaps.join(",") !== expectedGaps.join(",")) {
    failures.push(`expected backoff gaps ${expectedGaps.join(", ")}s, got ${gaps.join(", ")}s`);
  }

  // Restore, so nothing leaks if this is ever imported rather than run.
  Date.now = realDateNow;
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;

  console.log();
  if (failures.length > 0) {
    for (const f of failures) console.error("FAIL:", f);
    process.exit(1);
  }
  console.log(
    `PASS: the feed stopped after ${EXPECTED_MAX_FAILURES} consecutive failures ` +
      `with doubling backoff, over ${TICKS} ticks that would previously have been ` +
      `${TICKS} settlement attempts and ${TICKS * 2} database rows.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("test harness failed:", err);
  process.exit(1);
});
