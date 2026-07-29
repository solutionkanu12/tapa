import "dotenv/config";
import express from "express";
import { sessionRouter } from "./routes/session";
import { reconcilePendingSettlements } from "./reconcile";

const app = express();
app.use(express.json());
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
