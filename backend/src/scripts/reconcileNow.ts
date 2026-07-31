import "dotenv/config";
import { pool } from "../db.js";
import { reconcilePendingSettlements } from "../reconcile.js";

async function showPending(label: string) {
  const { rows } = await pool.query(
    `select s.id, s.amount, s.status, s.tx_hash, s.authorizer, s.nonce,
            coalesce(s.created_at, ue.occurred_at) as started_at
     from settlements s
     left join usage_events ue on ue.id = s.usage_event_id
     where s.status not in ('confirmed')
     order by started_at asc`
  );
  console.log(`\n=== ${label} (non-confirmed settlements) ===`);
  if (rows.length === 0) console.log("  none");
  for (const row of rows) {
    console.log(
      `  ${row.id}  ${row.status.padEnd(9)}  ${row.amount} USDC  ` +
        `nonce=${row.nonce ?? "none"}  tx=${row.tx_hash ?? "none"}`
    );
  }
}

async function main() {
  await showPending("before");

  const outcomes = await reconcilePendingSettlements();

  console.log(`\n=== reconciler resolved ${outcomes.length} row(s) ===`);
  for (const outcome of outcomes) {
    console.log(`  ${outcome.settlementId}`);
    console.log(`    resolution: ${outcome.resolution}`);
    if (outcome.txHash) console.log(`    tx_hash:    ${outcome.txHash}`);
    console.log(`    reason:     ${outcome.reason}`);
  }

  await showPending("after");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
