import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, toHex, type Hex } from "viem";
import type { PaymentRequirements } from "x402/types";

const FACILITATOR_URL = "https://api.x402.celo.org";
const X402_VERSION = 1;
const USDC_ASSET_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const CELO_MAINNET_CHAIN_ID = 42220;

// The published "x402" SDK's preparePaymentHeader/signPaymentHeader gate on a
// hardcoded client-side network allowlist that does not include "celo" at all
// (confirmed by reading its compiled source), even though the facilitator's
// own /supported endpoint accepts network: "celo". So this replicates that
// SDK's exact-scheme EVM signing logic (schemes/exact/evm/{client,sign}.ts)
// directly, using the real Celo chain id instead of the SDK's getNetworkId().
const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function createNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function main() {
  const apiKey = process.env.X402_API_KEY;
  const payTo = process.env.X402_PAYTO_WALLET;
  if (!apiKey || !payTo) {
    throw new Error("X402_API_KEY / X402_PAYTO_WALLET missing from env");
  }

  // Throwaway key generated in-memory only, never persisted, never funded.
  const throwawayKey = generatePrivateKey();
  const account = privateKeyToAccount(throwawayKey);
  console.log("Throwaway (unfunded) payer address:", account.address);

  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "celo" as PaymentRequirements["network"],
    maxAmountRequired: "10000", // 0.01 USDC, 6 decimals
    resource: "https://tapa.app/settlement-dry-run" as PaymentRequirements["resource"],
    description: "Tapa dry-run schema check, no funds should move",
    mimeType: "application/json",
    payTo: payTo as `0x${string}`,
    maxTimeoutSeconds: 300,
    asset: USDC_ASSET_ADDRESS,
    extra: { name: "USDC", version: "2" },
  };

  const nonce = createNonce();
  const validAfter = (Math.floor(Date.now() / 1000) - 600).toString();
  const validBefore = (Math.floor(Date.now() / 1000) + paymentRequirements.maxTimeoutSeconds).toString();

  const authorization = {
    from: account.address,
    to: paymentRequirements.payTo as `0x${string}`,
    value: paymentRequirements.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await account.signTypedData({
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    domain: {
      name: paymentRequirements.extra?.name,
      version: paymentRequirements.extra?.version,
      chainId: CELO_MAINNET_CHAIN_ID,
      verifyingContract: getAddress(paymentRequirements.asset),
    },
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  const paymentPayload = {
    x402Version: X402_VERSION,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: { signature, authorization },
  };

  const response = await fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    }),
  });

  const raw = await response.json().catch(() => undefined);
  console.log("HTTP status:", response.status);
  console.log("Raw facilitator response:", JSON.stringify(raw, null, 2));
}

main().catch((err) => {
  console.error("Dry run failed:", err);
  process.exitCode = 1;
});
