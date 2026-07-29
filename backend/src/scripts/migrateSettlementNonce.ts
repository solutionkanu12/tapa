import "dotenv/config";
import { pool } from "../db";

/**
 * Adds the columns the reconciler needs to resolve a settlement on-chain:
 * the EIP-3009 authorizer and nonce that uniquely identify the authorization,
 * and created_at so a stuck row can be bounded to a block range.
 */
async function main() {
  await pool.query(`
    alter table settlements add column if not exists authorizer text;
    alter table settlements add column if not exists nonce text;
    alter table settlements add column if not exists created_at timestamptz default now();
  `);

  const { rows } = await pool.query(
    `select column_name, data_type
     from information_schema.columns
     where table_schema = 'public' and table_name = 'settlements'
     order by ordinal_position`
  );

  console.log("settlements columns after migration:");
  for (const row of rows) {
    console.log(`  ${row.column_name}  ${row.data_type}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
