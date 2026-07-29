import "dotenv/config";
import { verifyUsdcPayment } from "../settlement";

const USDC_ASSET_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";

/** Reads the payer's USDC balance directly from Celo mainnet via balanceOf(address). */
async function readUsdcBalance(address: string): Promise<string> {
  const data = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
  const response = await fetch(CELO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: USDC_ASSET_ADDRESS, data }, "latest"],
    }),
  });
  const json = (await response.json()) as { result?: string };
  if (!json.result) return "unknown";
  return (Number(BigInt(json.result)) / 1e6).toFixed(6);
}

async function main() {
  console.log("=== /verify pre-flight, no funds move, no nonce consumed ===");

  const result = await verifyUsdcPayment({
    amountUsdc: 0.01,
    description: "Tapa Phase 3 pre-flight verify - single water usage event",
    resource: "https://tapa.app/settlement-preflight",
  });

  console.log("Funded payer address:", result.payerAddress);
  console.log("Payer USDC balance on Celo mainnet:", await readUsdcBalance(result.payerAddress));
  console.log("HTTP status:", result.status);
  console.log("Raw facilitator response:", JSON.stringify(result.raw, null, 2));

  const isValid = (result.raw as { isValid?: unknown })?.isValid === true;
  console.log(
    isValid
      ? "\nVERIFY PASSED. Signature validates against the funded wallet."
      : "\nVERIFY DID NOT PASS. Do not proceed to /settle until this is understood."
  );

  if (!isValid) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Verify pre-flight failed:", err);
  process.exitCode = 1;
});
