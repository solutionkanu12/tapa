import "dotenv/config";
import express from "express";
import { sessionRouter } from "./routes/session";
import { reconcilePendingSettlements } from "./reconcile";

const app = express();
app.use(express.json());

// The dashboard is served from a different origin in development and from
// Vercel in production, so the API has to opt into cross-origin requests.
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Tapa backend listening on port ${port}`);

  // Any settlement left mid-flight by a previous process is resolved on boot,
  // then periodically for anything stranded while this process is running.
  void runReconciler("startup");
  setInterval(() => void runReconciler("interval"), RECONCILE_INTERVAL_MS).unref();
});
