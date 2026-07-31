import { Router } from "express";
import { pool } from "../db";
import { getPrice } from "../pricing";
import { rateLimit, requireApiKey } from "../auth";
import { isFeedActive, startFeed, stopFeed, updateFeedLimit } from "../usageFeed";

export const sessionRouter = Router();

/**
 * Ceiling on what a single session may ever spend.
 *
 * Without one, a typo or a bug can set a limit far larger than the payer
 * wallet, and the feed will happily settle until the wallet is empty. Resolved
 * at module load so a malformed value stops the process rather than silently
 * disabling the cap.
 */
const MAX_SPENDING_LIMIT_USDC = (() => {
  const raw = process.env.MAX_SPENDING_LIMIT_USDC;
  if (raw === undefined || raw.trim() === "") return 0.25;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `MAX_SPENDING_LIMIT_USDC must be a positive number, got "${raw}"`
    );
  }
  return parsed;
})();

/** Shared validation, so the cap cannot be enforced on start but missed on update. */
function spendingLimitError(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "spending_limit must be a positive number";
  }
  if (value > MAX_SPENDING_LIMIT_USDC) {
    return `spending_limit must not exceed ${MAX_SPENDING_LIMIT_USDC} USDC`;
  }
  return null;
}

// Applied before authentication, so an unauthenticated flood is throttled too.
sessionRouter.use(
  rateLimit({ windowMs: 60_000, max: 240, label: "session-read" })
);
sessionRouter.use(requireApiKey);

/**
 * Tighter budget for the routes that can start or extend real spending. Reads
 * are polled every couple of seconds by the dashboard; these are not.
 */
const spendLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 10,
  label: "session-spend",
});

/**
 * The wallet's current active session, so a reconnecting or refreshing
 * dashboard resumes rather than starting a second metering run.
 */
sessionRouter.get("/session/active", async (req, res) => {
  const wallet = req.query.wallet_address;

  if (typeof wallet !== "string" || wallet.trim() === "") {
    return res.status(400).json({ error: "wallet_address is required" });
  }

  try {
    const result = await pool.query(
      `select s.id, s.spending_limit, s.status, s.started_at
       from sessions s
       join users u on u.id = s.user_id
       where lower(u.wallet_address) = lower($1) and s.status = 'active'
       order by s.started_at desc
       limit 1`,
      [wallet]
    );

    if (result.rowCount === 0) return res.json({ session: null });

    const row = result.rows[0];
    return res.json({
      session: {
        session_id: row.id,
        spending_limit: Number(row.spending_limit),
        status: row.status,
        started_at: row.started_at,
        // A server restart clears in-memory feeds while the row stays active.
        metering: isFeedActive(row.id),
      },
    });
  } catch (err) {
    console.error("GET /session/active failed", err);
    res.status(500).json({ error: "failed to look up session" });
  }
});

sessionRouter.post("/session/start", spendLimiter, async (req, res) => {
  const { wallet_address, spending_limit } = req.body ?? {};

  if (typeof wallet_address !== "string" || wallet_address.trim() === "") {
    return res.status(400).json({ error: "wallet_address is required" });
  }
  const limitError = spendingLimitError(spending_limit);
  if (limitError) {
    return res.status(400).json({ error: limitError });
  }

  try {
    const userResult = await pool.query(
      `insert into users (wallet_address) values ($1)
       on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
       returning id`,
      [wallet_address]
    );
    const userId = userResult.rows[0].id;

    // One metering run per wallet. Anything still active is closed out first,
    // so concurrent sessions cannot each spend up to their own limit, and so a
    // session stranded 'active' by a restart cannot block a new one.
    const superseded = await pool.query(
      `update sessions
       set status = 'ended', ended_at = now()
       where user_id = $1 and status = 'active'
       returning id`,
      [userId]
    );
    for (const row of superseded.rows) {
      stopFeed(row.id);
    }

    const sessionResult = await pool.query(
      `insert into sessions (user_id, spending_limit, status)
       values ($1, $2, 'active')
       returning id`,
      [userId, spending_limit]
    );
    const sessionId = sessionResult.rows[0].id;

    startFeed(sessionId, spending_limit);

    res.json({ session_id: sessionId });
  } catch (err) {
    console.error("POST /session/start failed", err);
    res.status(500).json({ error: "failed to start session" });
  }
});

sessionRouter.get("/session/:id/log", async (req, res) => {
  const { id } = req.params;

  try {
    const sessionResult = await pool.query(
      `select id, status, spending_limit from sessions where id = $1`,
      [id]
    );
    if (sessionResult.rowCount === 0) {
      return res.status(404).json({ error: "session not found" });
    }
    const session = sessionResult.rows[0];

    const eventsResult = await pool.query(
      `select ue.id, ue.unit_type, ue.quantity, ue.occurred_at,
              s.amount, s.currency, s.tx_hash, s.status as settlement_status, s.settled_at
       from usage_events ue
       left join settlements s on s.usage_event_id = ue.id
       where ue.session_id = $1
       order by ue.occurred_at asc`,
      [id]
    );

    let totalSettled = 0;
    const events = eventsResult.rows.map((row) => {
      const quantity = Number(row.quantity);
      // Prefer the amount actually recorded against the settlement. Fall back to
      // the computed price only when no settlement row exists for the event.
      const amount = row.amount !== null ? Number(row.amount) : getPrice(row.unit_type, quantity);

      if (row.settlement_status === "confirmed") {
        totalSettled += amount;
      }

      return {
        id: row.id,
        unit_type: row.unit_type,
        quantity,
        amount: Number(amount.toFixed(6)),
        currency: row.currency,
        tx_hash: row.tx_hash,
        explorer_url: row.tx_hash ? `https://celoscan.io/tx/${row.tx_hash}` : null,
        settlement_status: row.settlement_status,
        occurred_at: row.occurred_at,
        settled_at: row.settled_at,
      };
    });

    const totalQuantity = eventsResult.rows.reduce(
      (sum, row) => sum + Number(row.quantity),
      0
    );

    res.json({
      session_id: session.id,
      status: session.status,
      spending_limit: Number(session.spending_limit),
      total_settled: Number(totalSettled.toFixed(6)),
      total_quantity: Number(totalQuantity.toFixed(2)),
      metering: isFeedActive(session.id),
      events,
    });
  } catch (err) {
    console.error("GET /session/:id/log failed", err);
    res.status(500).json({ error: "failed to load session log" });
  }
});

/**
 * Updates the session's spending limit. Persisted, and applied to the running
 * feed so enforcement takes effect immediately rather than at the next restart.
 */
sessionRouter.patch("/session/:id/limit", spendLimiter, async (req, res) => {
  const { id } = req.params;
  const { spending_limit } = req.body ?? {};

  const limitError = spendingLimitError(spending_limit);
  if (limitError) {
    return res.status(400).json({ error: limitError });
  }

  try {
    const result = await pool.query(
      `update sessions set spending_limit = $2
       where id = $1 and status = 'active'
       returning id, spending_limit`,
      [id, spending_limit]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "session not found or not active" });
    }

    updateFeedLimit(id, spending_limit);

    res.json({
      session_id: result.rows[0].id,
      spending_limit: Number(result.rows[0].spending_limit),
    });
  } catch (err) {
    console.error("PATCH /session/:id/limit failed", err);
    res.status(500).json({ error: "failed to update spending limit" });
  }
});

sessionRouter.post("/session/:id/end", spendLimiter, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `update sessions
       set status = 'ended', ended_at = now()
       where id = $1 and status = 'active'
       returning id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "session not found or not active" });
    }

    stopFeed(id);

    res.json({ status: "ended" });
  } catch (err) {
    console.error("POST /session/:id/end failed", err);
    res.status(500).json({ error: "failed to end session" });
  }
});
