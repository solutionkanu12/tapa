import { settleUsdcPayment } from "../settlement";

async function main() {
  const result = await settleUsdcPayment({
    amountUsdc: 0.01,
    description: "Tapa Phase 3 real settlement test - single water usage event",
    resource: "https://tapa.app/settlement-test",
  });

  console.log("HTTP status:", result.status);
  console.log("Raw facilitator response:", JSON.stringify(result.raw, null, 2));

  if (result.txHash) {
    console.log("Transaction hash:", result.txHash);
    console.log("Celoscan link:", `https://celoscan.io/tx/${result.txHash}`);
  } else {
    console.log("No transaction hash in response.");
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Settlement test failed:", err);
  process.exitCode = 1;
});
