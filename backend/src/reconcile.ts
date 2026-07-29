import "dotenv/config";
import { createPublicClient, http, parseAbiItem, getAddress, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { pool } from "./db";
import { USDC_ASSET_ADDRESS } from "./settlement";

const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";

/** Celo produces one block per second, measured against two known settlements. */
const BLOCKS_PER_SECOND = 1;
/** Margin either side of the estimated block, to absorb clock and block-time drift. */
const BLOCK_BUFFER = 900;
/**
 * getLogs window size. Forno caps a single query at 5000 blocks, so stay below
 * that and let getLogsChunked walk larger ranges.
 */
const LOG_CHUNK_BLOCKS = 4500;
/** Beyond this age a row is not worth searching for, it is marked abandoned. */
const MAX_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;
/**
 * Rows younger than this are skipped, because a settlement that is legitimately
 * in flight is also 'pending' and must not be resolved out from under itself.
 */
const MIN_AGE_SECONDS = 120;

const authorizationUsedEvent = parseAbiItem(
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const eip3009Abi = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const client = createPublicClient({ chain: celo, transport: http(CELO_RPC_URL) });

export type Resolution = "confirmed" | "failed" | "abandoned" | "skipped";

export interface ReconcileOutcome {
  settlementId: string;
  resolution: Resolution;
  txHash?: string;
  reason: string;
}

interface PendingRow {
  id: string;
  amount: string;
  authorizer: string | null;
  nonce: string | null;
  started_at: Date;
}

/** Estimates the block range to search for a settlement attempted at `startedAt`. */
async function blockRangeFor(startedAt: Date): Promise<{ from: bigint; to: bigint } | null> {
  const ageSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  if (ageSeconds > MAX_LOOKBACK_SECONDS) return null;

  const latest = await client.getBlockNumber();
  const estimated = latest - BigInt(Math.max(0, ageSeconds) * BLOCKS_PER_SECOND);
  const from = estimated - BigInt(BLOCK_BUFFER);
  return { from: from < 0n ? 0n : from, to: latest };
}

/** Scans a block range in chunks, since public RPCs cap getLogs spans. */
async function getLogsChunked<T>(
  from: bigint,
  to: bigint,
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  for (let start = from; start <= to; start += BigInt(LOG_CHUNK_BLOCKS)) {
    const end = start + BigInt(LOG_CHUNK_BLOCKS) - 1n;
    results.push(...(await fetchChunk(start, end > to ? to : end)));
  }
  return results;
}

/**
 * Primary path. The authorizer and nonce uniquely identify an EIP-3009
 * authorization, and USDC records on-chain whether it has been consumed, so
 * this is a definitive answer rather than an inference.
 */
async function resolveByNonce(row: PendingRow): Promise<ReconcileOutcome> {
  const authorizer = getAddress(row.authorizer as string);
  const nonce = row.nonce as Hex;

  const used = await client.readContract({
    address: getAddress(USDC_ASSET_ADDRESS),
    abi: eip3009Abi,
    functionName: "authorizationState",
    args: [authorizer, nonce],
  });

  if (!used) {
    return {
      settlementId: row.id,
      resolution: "failed",
      reason: "authorizationState is false, the authorization was never consumed on-chain",
    };
  }

  // It settled. Recover the transaction hash from the AuthorizationUsed log.
  const range = await blockRangeFor(row.started_at);
  if (!range) {
    return {
      settlementId: row.id,
      resolution: "confirmed",
      reason: "authorizationState is true, but the row is too old to recover a tx hash",
    };
  }

  const logs = await getLogsChunked(range.from, range.to, (fromBlock, toBlock) =>
    client.getLogs({
      address: getAddress(USDC_ASSET_ADDRESS),
      event: authorizationUsedEvent,
      args: { authorizer, nonce },
      fromBlock,
      toBlock,
    })
  );

  return {
    settlementId: row.id,
    resolution: "confirmed",
    txHash: logs[0]?.transactionHash,
    reason: logs[0]
      ? "authorizationState is true, tx hash recovered from AuthorizationUsed log"
      : "authorizationState is true, but no matching log found in the searched range",
  };
}

/**
 * Fallback for rows written before the nonce was persisted. Matches on an exact
 * transfer amount from payer to payTo, excluding transactions already recorded
 * against other settlements. Ambiguity is reported rather than guessed at.
 */
async function resolveLegacyByAmount(row: PendingRow): Promise<ReconcileOutcome> {
  const payTo = process.env.X402_PAYTO_WALLET;
  const payerKey = process.env.PAYER_PRIVATE_KEY;
  if (!payTo || !payerKey) {
    return {
      settlementId: row.id,
      resolution: "abandoned",
      reason: "no nonce recorded and payer/payTo not configured, cannot search on-chain",
    };
  }

  const range = await blockRangeFor(row.started_at);
  if (!range) {
    return {
      settlementId: row.id,
      resolution: "abandoned",
      reason: "no nonce recorded and the row is older than the lookback window",
    };
  }

  const payer = privateKeyToAccount(payerKey as Hex).address;
  const atomicValue = BigInt(Math.round(Number(row.amount) * 1e6));

  const logs = await getLogsChunked(range.from, range.to, (fromBlock, toBlock) =>
    client.getLogs({
      address: getAddress(USDC_ASSET_ADDRESS),
      event: transferEvent,
      args: { from: payer as Address, to: getAddress(payTo) },
      fromBlock,
      toBlock,
    })
  );

  const { rows: knownRows } = await pool.query(
    `select tx_hash from settlements where tx_hash is not null`
  );
  const known = new Set(knownRows.map((r) => String(r.tx_hash).toLowerCase()));

  const candidates = logs.filter(
    (log) => log.args.value === atomicValue && !known.has(log.transactionHash.toLowerCase())
  );

  if (candidates.length === 0) {
    return {
      settlementId: row.id,
      resolution: "failed",
      reason: `no unaccounted-for transfer of ${row.amount} USDC from payer to payTo in the searched range`,
    };
  }

  if (candidates.length > 1) {
    return {
      settlementId: row.id,
      resolution: "abandoned",
      reason: `${candidates.length} unaccounted-for transfers match this amount, cannot attribute one definitively`,
    };
  }

  return {
    settlementId: row.id,
    resolution: "confirmed",
    txHash: candidates[0].transactionHash,
    reason: "matched a single unaccounted-for transfer of the exact amount from payer to payTo",
  };
}

async function applyResolution(outcome: ReconcileOutcome): Promise<void> {
  if (outcome.resolution === "confirmed") {
    await pool.query(
      `update settlements
       set status = 'confirmed', tx_hash = coalesce($2, tx_hash), settled_at = coalesce(settled_at, now())
       where id = $1`,
      [outcome.settlementId, outcome.txHash ?? null]
    );
    return;
  }

  if (outcome.resolution === "failed" || outcome.resolution === "abandoned") {
    await pool.query(`update settlements set status = $2 where id = $1`, [
      outcome.settlementId,
      outcome.resolution,
    ]);
  }
}

/**
 * Resolves every settlement stuck in 'pending' to a definitive state, so a
 * process that died mid-settlement can never leave spent USDC unrecorded.
 */
export async function reconcilePendingSettlements(): Promise<ReconcileOutcome[]> {
  const { rows } = await pool.query<PendingRow>(
    `select s.id,
            s.amount,
            s.authorizer,
            s.nonce,
            coalesce(s.created_at, ue.occurred_at, now()) as started_at
     from settlements s
     left join usage_events ue on ue.id = s.usage_event_id
     where s.status = 'pending'
       and coalesce(s.created_at, ue.occurred_at, now()) < now() - make_interval(secs => $1)
     order by started_at asc`,
    [MIN_AGE_SECONDS]
  );

  const outcomes: ReconcileOutcome[] = [];

  for (const row of rows) {
    try {
      const outcome =
        row.authorizer && row.nonce ? await resolveByNonce(row) : await resolveLegacyByAmount(row);
      await applyResolution(outcome);
      outcomes.push(outcome);
    } catch (err) {
      outcomes.push({
        settlementId: row.id,
        resolution: "skipped",
        reason: `error during reconciliation, left pending for the next run: ${String(err)}`,
      });
    }
  }

  return outcomes;
}
