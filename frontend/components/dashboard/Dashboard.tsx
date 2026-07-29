"use client";

import { BrandMark } from "../BrandMark";
import { formatAddress } from "../wallet/types";
import { useWallet } from "../wallet/WalletProvider";
import { LiveDial } from "./LiveDial";
import { SettlementFeed } from "./SettlementFeed";
import { SpendingLimit } from "./SpendingLimit";
import { useSession } from "./useSession";
import { useUsdcBalance } from "./useUsdcBalance";

/** Only water is metered today; the others are shown as the roadmap. */
const UNIT_TABS = [
  { id: "water", label: "Water", enabled: true },
  { id: "solar", label: "Solar", enabled: false },
  { id: "data", label: "Data", enabled: false },
];

export function Dashboard() {
  const { address, disconnect } = useWallet();
  const session = useSession(address);
  const balance = useUsdcBalance();

  const log = session.log;
  const metering = Boolean(log?.metering && log.status === "active");
  const sessionActive = Boolean(session.sessionId);

  const handleDisconnect = () => {
    // End the metering run before dropping the wallet, so the agent service
    // stops settling rather than being left with an orphaned active session.
    void session.stop().finally(() => disconnect());
  };

  return (
    <div className="dash-page">
      <div className="dash-nav">
        <div className="brand">
          <BrandMark tile="#F3F0FA" drop="#12112A" />
          tapa
        </div>
        <div className="dash-wallet-pill">
          <span className="dot" />
          <span title={address ?? undefined}>
            {address ? formatAddress(address) : "-"}
          </span>
        </div>
        <button
          type="button"
          className="disconnect-btn"
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>

      {session.error ? (
        <div className="dash-banner">
          <div className="inner">{session.error}</div>
        </div>
      ) : null}

      <div className="dash-body">
        <div className="dash-left">
          <div className="util-tabs">
            {UNIT_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={`util-tab${tab.enabled ? " active" : ""}`}
                disabled={!tab.enabled}
                title={tab.enabled ? undefined : "Not metered yet"}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="balance-card">
            <div className="label">Wallet balance</div>
            <div className="amt">
              <span>$</span>{" "}
              {balance === null ? "--" : balance.toFixed(6)}
            </div>
            <div className="dash-sub">USDC on Celo, ready to settle</div>
          </div>

          <SpendingLimit
            serverLimit={log?.spending_limit ?? null}
            totalSettled={log?.total_settled ?? 0}
            sessionActive={sessionActive}
            starting={session.starting || session.loading}
            onStart={(limit) => void session.start(limit)}
            onChange={(limit) => void session.setLimit(limit)}
          />

          <SettlementFeed events={log?.events ?? []} metering={metering} />
        </div>

        <div className="dash-right">
          <div className={metering ? "floaty" : undefined}>
            <LiveDial
              quantity={log?.total_quantity ?? 0}
              progress={
                log && log.spending_limit > 0
                  ? log.total_settled / log.spending_limit
                  : 0
              }
              metering={metering}
            />
          </div>

          {log && log.status === "limit_reached" ? (
            <p className="limit-hint" style={{ textAlign: "center" }}>
              Session ceiling reached. Metering has stopped.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
