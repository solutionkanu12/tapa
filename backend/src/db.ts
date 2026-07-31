import "dotenv/config";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Bounded so a burst of concurrent settlements cannot open connections
  // without limit against a small managed Postgres instance.
  max: 10,
  // Reap idle clients rather than holding them until the provider drops them
  // from its side, which is what turns an idle client into an error event.
  idleTimeoutMillis: 30_000,
  // Fail a query that cannot get a connection instead of waiting forever and
  // holding the caller, and with it a settlement slot, open indefinitely.
  connectionTimeoutMillis: 10_000,
});

/**
 * Without this listener an error on an idle pooled client is emitted as an
 * unhandled 'error' event, which Node turns into an uncaught exception and the
 * process exits. A managed Postgres dropping an idle connection is routine, so
 * the server has to survive it: the pool discards the bad client on its own and
 * the next query checks out a fresh one.
 */
pool.on("error", (err) => {
  console.error("postgres pool: idle client error, connection discarded", err);
});
