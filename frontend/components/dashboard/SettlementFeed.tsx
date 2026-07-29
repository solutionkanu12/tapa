"use client";

import type { SettlementEvent } from "@/lib/api";

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function timeOf(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function amountClass(status: SettlementEvent["settlement_status"]): string {
  if (status === "confirmed") return "log-amt";
  if (status === "failed" || status === "abandoned") return "log-amt is-failed";
  return "log-amt is-pending";
}

/**
 * Real settlement history for the session. Every row is an actual usage event,
 * and confirmed rows link to the transaction on Celoscan so it can be checked
 * independently.
 */
export function SettlementFeed({
  events,
  metering,
}: {
  events: SettlementEvent[];
  metering: boolean;
}) {
  // Newest first, which is the opposite of the API's chronological order.
  const rows = [...events].reverse();

  return (
    <div className="dash-card" style={{ transform: "none", boxShadow: "none" }}>
      <div className="dash-top">
        <span className="dash-title">Settlement log</span>
        {metering ? (
          <span className="live-pill">
            <span className="dot" />
            metering
          </span>
        ) : (
          <span className="dash-title">idle</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="log-empty">
          No settlements yet. Each metered unit is priced and paid the moment it
          is used, and will appear here with its transaction hash.
        </p>
      ) : (
        <div className="log log-scroll">
          {rows.map((event) => (
            <div className="log-row" key={event.id}>
              <div className="log-left">
                <span className="log-unit">
                  {event.quantity} L {event.unit_type}
                </span>
                <span className="log-time">
                  {timeOf(event.settled_at ?? event.occurred_at)}
                </span>
              </div>
              <div className="log-right">
                <span className={amountClass(event.settlement_status)}>
                  {event.settlement_status === "confirmed" ? "+" : ""}
                  {event.amount.toFixed(6)}
                </span>
                {event.explorer_url ? (
                  <a
                    className="log-tx"
                    href={event.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.tx_hash ? shortHash(event.tx_hash) : "view"}
                  </a>
                ) : (
                  <span className="log-time">
                    {event.settlement_status ?? "pending"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
