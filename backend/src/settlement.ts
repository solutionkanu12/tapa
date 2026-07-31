import "dotenv/config";
import type { PaymentRequirements } from "x402/types";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, toHex, type Hex } from "viem";

const FACILITATOR_URL = "https://api.x402.celo.org";
const X402_VERSION = 1;
const NETWORK = "celo";
const CELO_MAINNET_CHAIN_ID = 42220;

/**
 * Node's fetch has no request timeout by default, so a facilitator that accepts
 * a connection and then stalls holds the caller open indefinitely. Every call
 * here is on the settlement path, where a hung request also pins a concurrency
 * slot and the database rows written just before it, so both calls are bounded.
 */
const FACILITATOR_TIMEOUT_MS = 20_000;

/**
 * How long a successful support check stays good for. The guard exists to stop
 * this signing real authorizations for a network the facilitator has dropped,
 * which is not a per-request risk, and it was previously re-fetched on every
 * usage event. A short window keeps the guard meaningful while removing a
 * second unbounded network call from each settlement.
 */
const SUPPORT_CACHE_MS = 60_000;

let supportConfirmedAt = 0;

// Native USDC on Celo mainnet (chain id 42220), verified on-chain via name()/symbol()/
// decimals()/version() calls against the deployed proxy at this address.
export const USDC_ASSET_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDC_DECIMALS = 6;
const USDC_EIP712_DOMAIN = { name: "USDC", version: "2" };

// The published "x402" SDK's preparePaymentHeader/signPaymentHeader gate on a
// hardcoded client-side network allowlist that does not include "celo" at all,
// even though the facilitator's own /supported endpoint accepts network "celo".
// So this replicates the SDK's exact-scheme EVM signing logic
// (schemes/exact/evm/{client,sign}.ts) directly, using the real Celo chain id
// instead of the SDK's getNetworkId(), which also rejects "celo".
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

export interface PaymentParams {
  amountUsdc: number;
  description: string;
  resource: string;
}

export interface FacilitatorResult {
  ok: boolean;
  status: number;
  raw: unknown;
  payerAddress: string;
}

export interface SettleResult extends FacilitatorResult {
  txHash?: string;
}

/** The EIP-3009 authorization, exposed so callers can persist the nonce before sending. */
export interface Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

export interface PreparedPayment {
  paymentPayload: unknown;
  paymentRequirements: PaymentRequirements;
  payerAddress: `0x${string}`;
  authorization: Authorization;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function toAtomicUnits(amountUsdc: number): string {
  return Math.round(amountUsdc * 10 ** USDC_DECIMALS).toString();
}

function createNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Real-money guard: confirm the facilitator still advertises Celo support before
 * anything is signed or sent. Throws rather than returning so no caller can
 * accidentally proceed past a failed check.
 */
async function assertCeloSupported(): Promise<void> {
  if (Date.now() - supportConfirmedAt < SUPPORT_CACHE_MS) return;

  let raw: unknown;
  let status: number;
  try {
    const response = await fetch(`${FACILITATOR_URL}/supported`, {
      signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
    });
    status = response.status;
    raw = await response.json();
  } catch (err) {
    throw new Error(
      `Could not confirm Celo support from ${FACILITATOR_URL}/supported (${String(err)}). ` +
        `Refusing to sign or send a real settlement.`
    );
  }

  const kinds = (raw as { kinds?: unknown })?.kinds;
  const supportsCelo =
    Array.isArray(kinds) &&
    kinds.some((kind) => (kind as { network?: unknown })?.network === NETWORK);

  if (!supportsCelo) {
    throw new Error(
      `Facilitator ${FACILITATOR_URL}/supported (HTTP ${status}) does not list network "${NETWORK}". ` +
        `Refusing to sign or send a real settlement. Response: ${JSON.stringify(raw)}`
    );
  }

  supportConfirmedAt = Date.now();
}

/**
 * Builds and signs an EIP-3009 payment authorization from the funded payer wallet.
 * Shared by both the /verify pre-flight and the real /settle call, so that a
 * successful verify is evidence about the exact payload settle will send, not
 * about a separate copy of the signing logic.
 *
 * Exposed separately from submission so a caller can durably persist the
 * authorizer and nonce *before* the network call. Without that ordering, a
 * process death mid-settlement leaves a payment that cannot be looked up
 * on-chain afterwards.
 */
export async function prepareUsdcPayment(params: PaymentParams): Promise<PreparedPayment> {
  const payerPrivateKey = requireEnv("PAYER_PRIVATE_KEY") as `0x${string}`;
  const payTo = requireEnv("X402_PAYTO_WALLET") as `0x${string}`;

  await assertCeloSupported();

  const account = privateKeyToAccount(payerPrivateKey);

  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: NETWORK as PaymentRequirements["network"],
    maxAmountRequired: toAtomicUnits(params.amountUsdc),
    resource: params.resource as PaymentRequirements["resource"],
    description: params.description,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset: USDC_ASSET_ADDRESS,
    extra: USDC_EIP712_DOMAIN,
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: payTo,
    value: paymentRequirements.maxAmountRequired,
    validAfter: (nowSeconds - 600).toString(),
    validBefore: (nowSeconds + paymentRequirements.maxTimeoutSeconds).toString(),
    nonce: createNonce(),
  };

  const signature = await account.signTypedData({
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    domain: {
      name: USDC_EIP712_DOMAIN.name,
      version: USDC_EIP712_DOMAIN.version,
      chainId: CELO_MAINNET_CHAIN_ID,
      verifyingContract: getAddress(USDC_ASSET_ADDRESS),
    },
    // Signed as uint256, but the wire payload keeps these as strings because
    // that is what the x402 authorization schema requires.
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

  return { paymentPayload, paymentRequirements, payerAddress: account.address, authorization };
}

/**
 * Submits an already-prepared and signed payment. Split from preparation so the
 * caller can persist the authorization first.
 */
export async function submitPreparedPayment(
  endpoint: "verify" | "settle",
  prepared: PreparedPayment
): Promise<FacilitatorResult> {
  const apiKey = requireEnv("X402_API_KEY");
  const { paymentPayload, paymentRequirements, payerAddress } = prepared;

  const response = await fetch(`${FACILITATOR_URL}/${endpoint}`, {
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
    signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
  });

  const raw = await response.json().catch(() => undefined);
  return { ok: response.ok, status: response.status, raw, payerAddress };
}

export function extractTxHash(raw: unknown): string | undefined {
  const value =
    raw && typeof raw === "object" && "transaction" in raw
      ? (raw as Record<string, unknown>).transaction
      : undefined;
  return typeof value === "string" && value.startsWith("0x") ? value : undefined;
}

/**
 * Validates a payment authorization without settling it. Moves no funds and
 * does not consume the EIP-3009 nonce, since that only happens on-chain.
 */
export async function verifyUsdcPayment(params: PaymentParams): Promise<FacilitatorResult> {
  return submitPreparedPayment("verify", await prepareUsdcPayment(params));
}

/**
 * Convenience one-shot settle. Callers that need the orphan-recovery guarantee
 * should use prepareUsdcPayment, persist the nonce, then submitPreparedPayment.
 */
export async function settleUsdcPayment(params: PaymentParams): Promise<SettleResult> {
  const result = await submitPreparedPayment("settle", await prepareUsdcPayment(params));
  return { ...result, txHash: extractTxHash(result.raw) };
}
