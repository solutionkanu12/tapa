import "dotenv/config";
import express from "express";
import { sessionRouter } from "./routes/session.js";
import { reconcilePendingSettlements } from "./reconcile.js";
import { assertAuthConfigured } from "./auth.js";

const app = express();

// Render and Vercel both put a proxy in front, so the client address used for
// rate limiting comes from X-Forwarded-For rather than the socket.
app.set("trust proxy", 1);

app.use(express.json());

/**
 * The dashboard is served from a different origin, so the API has to opt into
 * cross-origin requests. This is an explicit allowlist rather than a wildcard:
 * a wildcard lets any site on the internet drive the endpoints that spend real
 * USDC. Comma-separated, so a production origin can be added to the environment
 * without a code change.
 *
 * Note this only constrains browsers. It is not what stops a direct call, which
 * is the shared secret and the rate limiter.
 */
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");

app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Api-Key");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(sessionRouter);

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

async function runReconciler(trigger: string): Promise<void> {
  try {
    const outcomes = await reconcilePendingSettlements();
    if (outcomes.length === 0) return;
    console.log(`reconciler (${trigger}): resolved ${outcomes.length} stuck settlement(s)`);
    for (const outcome of outcomes) {
      console.log(
        `  ${outcome.settlementId} -> ${outcome.resolution}` +
          `${outcome.txHash ? ` (${outcome.txHash})` : ""}: ${outcome.reason}`
      );
    }
  } catch (err) {
    console.error(`reconciler (${trigger}) failed`, err);
  }
}

// Refuse to boot without a shared secret, rather than serving the spending
// endpoints unauthenticated.
assertAuthConfigured();

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Tapa backend listening on port ${port}`);

  // Any settlement left mid-flight by a previous process is resolved on boot,
  // then periodically for anything stranded while this process is running.
  void runReconciler("startup");
  setInterval(() => void runReconciler("interval"), RECONCILE_INTERVAL_MS).unref();
});
