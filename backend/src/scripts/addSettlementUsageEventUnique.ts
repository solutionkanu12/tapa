import "dotenv/config";
import { pool } from "../db";

/**
 * Adds a database-level guarantee that one usage event has at most one
 * settlement.
 *
 * The application only ever writes one settlement per usage event, but that is
 * a convention, not a guarantee: a retry, a double-invoked feed tick, or a
 * future bug could record two payments against the same unit of usage and
 * inflate the settlement count. The constraint makes that impossible rather
 * than merely unlikely.
 *
 * NULL usage_event_id is left unconstrained on purpose. Postgres permits
 * multiple NULLs in a unique index, and the reconciler tests deliberately
 * insert settlements with no usage event.
 */
const CONSTRAINT = "settlements_usage_event_id_key";

async function main(): Promise<void> {
  const { rows: existing } = await pool.query(
    `select 1 from pg_constraint
     where conrelid = 'settlements'::regclass and conname = $1`,
    [CONSTRAINT]
  );

  if (existing.length > 0) {
    console.log(`${CONSTRAINT} already exists, nothing to do.`);
    return;
  }

  // Refuse to add the constraint over data that already violates it, rather
  // than failing with a bare Postgres error.
  const { rows: dupes } = await pool.query(
    `select usage_event_id, count(*) as n
     from settlements
     where usage_event_id is not null
     group by usage_event_id
     having count(*) > 1`
  );

  if (dupes.length > 0) {
    console.error(
      `Refusing to add ${CONSTRAINT}: ${dupes.length} usage event(s) already ` +
        `have more than one settlement. Resolve these first:`
    );
    for (const row of dupes) {
      console.error(`  usage_event_id ${row.usage_event_id} has ${row.n} settlements`);
    }
    process.exitCode = 1;
    return;
  }

  await pool.query(
    `alter table settlements
     add constraint ${CONSTRAINT} unique (usage_event_id)`
  );

  console.log(`Added ${CONSTRAINT}: one settlement per usage event is now enforced by the database.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
