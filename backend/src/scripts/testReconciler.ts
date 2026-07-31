import "dotenv/config";
import { pool } from "../db.js";
import { reconcilePendingSettlements } from "../reconcile.js";
import { extractTxHash, prepareUsdcPayment, submitPreparedPayment } from "../settlement.js";

const TEST_AMOUNT = 0.0002;

/** Inserts a pending settlement backdated past the reconciler's minimum age. */
async function insertPendingSettlement(
  authorizer: string,
  nonce: string,
  usageEventId: string | null
): Promise<string> {
  const { rows } = await pool.query(
    `insert into settlements
       (usage_event_id, amount, currency, status, authorizer, nonce, created_at)
     values ($1, $2, 'USDC', 'pending', $3, $4, now() - interval '10 minutes')
     returning id`,
    [usageEventId, TEST_AMOUNT, authorizer, nonce]
  );
  return rows[0].id;
}

async function statusOf(id: string) {
  const { rows } = await pool.query(
    `select status, tx_hash from settlements where id = $1`,
    [id]
  );
  return rows[0];
}

/**
 * Test A, negative path. Signs an authorization but never submits it, so the
 * nonce was never consumed on-chain. No funds move.
 */
async function testNeverSettled() {
  console.log("\n=== TEST A: authorization signed but never submitted ===");

  const prepared = await prepareUsdcPayment({
    amountUsdc: TEST_AMOUNT,
    description: "Reconciler test, never submitted",
    resource: "https://tapa.app/reconciler-test/never-submitted",
  });
  const id = await insertPendingSettlement(
    prepared.authorization.from,
    prepared.authorization.nonce,
    null
  );
  console.log(`  settlement row ${id} created, nonce ${prepared.authorization.nonce}`);
  console.log("  (not submitted to the facilitator, so no funds move)");

  const outcomes = await reconcilePendingSettlements();
  const outcome = outcomes.find((o) => o.settlementId === id);
  const after = await statusOf(id);

  console.log(`  reconciler said: ${outcome?.resolution} - ${outcome?.reason}`);
  console.log(`  db status now:   ${after.status}, tx_hash ${after.tx_hash ?? "none"}`);
  const pass = outcome?.resolution === "failed" && after.status === "failed";
  console.log(`  RESULT: ${pass ? "PASS" : "FAIL"} (expected failed)`);

  await pool.query(`delete from settlements where id = $1`, [id]);
  console.log("  synthetic row deleted, no money was involved");
  return pass;
}

/**
 * Test B, positive path. Reproduces the real orphan scenario exactly: persist
 * the nonce, settle for real, then never write the result, as if the process
 * died. The reconciler must recover the transaction hash from chain state alone.
 */
async function testOrphanedAfterSettling() {
  console.log("\n=== TEST B: settled for real, result never written (simulated crash) ===");

  const sessionResult = await pool.query(
    `insert into sessions (spending_limit, status) values ($1, 'ended') returning id`,
    [TEST_AMOUNT]
  );
  const sessionId = sessionResult.rows[0].id;
  const usageResult = await pool.query(
    `insert into usage_events (session_id, unit_type, quantity)
     values ($1, 'water', 0.4) returning id`,
    [sessionId]
  );
  const usageEventId = usageResult.rows[0].id;

  const prepared = await prepareUsdcPayment({
    amountUsdc: TEST_AMOUNT,
    description: "Reconciler test, orphaned after settling",
    resource: `https://tapa.app/usage/${usageEventId}`,
  });
  const id = await insertPendingSettlement(
    prepared.authorization.from,
    prepared.authorization.nonce,
    usageEventId
  );
  console.log(`  settlement row ${id} created, nonce ${prepared.authorization.nonce}`);

  const result = await submitPreparedPayment("settle", prepared);
  const realTxHash = extractTxHash(result.raw);
  console.log(`  facilitator settled, real tx hash: ${realTxHash}`);
  console.log("  deliberately NOT writing that hash to the db, simulating a crash");

  const before = await statusOf(id);
  console.log(`  db status before reconcile: ${before.status}, tx_hash ${before.tx_hash ?? "none"}`);

  const outcomes = await reconcilePendingSettlements();
  const outcome = outcomes.find((o) => o.settlementId === id);
  const after = await statusOf(id);

  console.log(`  reconciler said: ${outcome?.resolution} - ${outcome?.reason}`);
  console.log(`  db status now:   ${after.status}, tx_hash ${after.tx_hash ?? "none"}`);

  const pass =
    outcome?.resolution === "confirmed" &&
    after.status === "confirmed" &&
    after.tx_hash?.toLowerCase() === realTxHash?.toLowerCase();
  console.log(
    `  RESULT: ${pass ? "PASS" : "FAIL"} (expected confirmed, with the tx hash recovered from chain)`
  );
  console.log(`  recovered hash matches facilitator hash: ${
    after.tx_hash?.toLowerCase() === realTxHash?.toLowerCase()
  }`);
  return pass;
}

async function main() {
  const a = await testNeverSettled();
  const b = await testOrphanedAfterSettling();

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Test A (never settled -> failed):        ${a ? "PASS" : "FAIL"}`);
  console.log(`  Test B (orphaned settlement recovered):  ${b ? "PASS" : "FAIL"}`);

  await pool.end();
  if (!a || !b) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
