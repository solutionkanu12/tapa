import "dotenv/config";
import { pool } from "../db";

async function main() {
  const { rows } = await pool.query(
    `select table_name, column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position`
  );

  let current = "";
  for (const row of rows) {
    if (row.table_name !== current) {
      current = row.table_name;
      console.log(`\n${current}`);
    }
    const def = row.column_default ? `  default ${row.column_default}` : "";
    console.log(`  ${row.column_name}  ${row.data_type}  ${row.is_nullable === "NO" ? "NOT NULL" : ""}${def}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
