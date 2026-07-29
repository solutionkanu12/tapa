export type LogEntry = {
  unit: string;
  time: string;
  amount: string;
};

/**
 * Static settlement rows used by the landing page illustrations. The real
 * dashboard reads these from the agent service instead.
 */
export function SettlementLog({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="log">
      {entries.map((entry) => (
        <div className="log-row" key={`${entry.unit}-${entry.time}`}>
          <div className="log-left">
            <span className="log-unit">{entry.unit}</span>
            <span className="log-time">{entry.time}</span>
          </div>
          <span className="log-amt">{entry.amount}</span>
        </div>
      ))}
    </div>
  );
}
