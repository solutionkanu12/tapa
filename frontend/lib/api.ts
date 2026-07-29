/** Agent service client. Every call resolves, never throws. */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export type SettlementEvent = {
  id: string;
  unit_type: string;
  quantity: number;
  amount: number;
  currency: string | null;
  tx_hash: string | null;
  explorer_url: string | null;
  settlement_status: "pending" | "confirmed" | "failed" | "abandoned" | null;
  occurred_at: string;
  settled_at: string | null;
};

export type SessionLog = {
  session_id: string;
  status: "active" | "ended" | "limit_reached";
  spending_limit: number;
  total_settled: number;
  total_quantity: number;
  metering: boolean;
  events: SettlementEvent[];
};

export type ActiveSession = {
  session_id: string;
  spending_limit: number;
  status: string;
  started_at: string;
  metering: boolean;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function call<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });

    const body = (await response.json().catch(() => null)) as
      | (T & { error?: string })
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? `Request failed with status ${response.status}`,
      };
    }

    return { ok: true, data: body as T };
  } catch {
    // Almost always the agent service not running, which the UI explains.
    return {
      ok: false,
      error: `Could not reach the agent service at ${BASE_URL}.`,
    };
  }
}

export function startSession(
  walletAddress: string,
  spendingLimit: number
): Promise<ApiResult<{ session_id: string }>> {
  return call("/session/start", {
    method: "POST",
    body: JSON.stringify({
      wallet_address: walletAddress,
      spending_limit: spendingLimit,
    }),
  });
}

export function getActiveSession(
  walletAddress: string
): Promise<ApiResult<{ session: ActiveSession | null }>> {
  return call(
    `/session/active?wallet_address=${encodeURIComponent(walletAddress)}`
  );
}

export function getSessionLog(
  sessionId: string
): Promise<ApiResult<SessionLog>> {
  return call(`/session/${sessionId}/log`);
}

export function updateSpendingLimit(
  sessionId: string,
  spendingLimit: number
): Promise<ApiResult<{ session_id: string; spending_limit: number }>> {
  return call(`/session/${sessionId}/limit`, {
    method: "PATCH",
    body: JSON.stringify({ spending_limit: spendingLimit }),
  });
}

export function endSession(
  sessionId: string
): Promise<ApiResult<{ status: string }>> {
  return call(`/session/${sessionId}/end`, { method: "POST" });
}

export { BASE_URL as API_BASE_URL };
