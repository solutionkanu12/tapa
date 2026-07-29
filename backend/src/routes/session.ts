import { Router } from "express";
import { pool } from "../db";
import { getPrice } from "../pricing";
import { startFeed, stopFeed } from "../usageFeed";

export const sessionRouter = Router();

sessionRouter.post("/session/start", async (req, res) => {
  const { wallet_address, spending_limit } = req.body ?? {};

  if (typeof wallet_address !== "string" || wallet_address.trim() === "") {
    return res.status(400).json({ error: "wallet_address is required" });
  }
  if (typeof spending_limit !== "number" || !Number.isFinite(spending_limit) || spending_limit <= 0) {
    return res.status(400).json({ error: "spending_limit must be a positive number" });
  }

  try {
    const userResult = await pool.query(
      `insert into users (wallet_address) values ($1)
       on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
       returning id`,
      [wallet_address]
    );
    const userId = userResult.rows[0].id;

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
      `select id, status from sessions where id = $1`,
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

    res.json({
      session_id: session.id,
      status: session.status,
      total_settled: Number(totalSettled.toFixed(6)),
      events,
    });
  } catch (err) {
    console.error("GET /session/:id/log failed", err);
    res.status(500).json({ error: "failed to load session log" });
  }
});

sessionRouter.post("/session/:id/end", async (req, res) => {
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
