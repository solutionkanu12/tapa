import { SettlementLog, type LogEntry } from "./SettlementLog";

const SESSION_LOG: LogEntry[] = [
  { unit: "0.6 L water", time: "08:14:02", amount: "+0.03" },
  { unit: "2 min solar charge", time: "08:12:41", amount: "+0.05" },
  { unit: "4 MB data", time: "08:10:57", amount: "+0.02" },
  { unit: "0.9 L water", time: "08:09:18", amount: "+0.04" },
];

export function LiveMechanism() {
  return (
    <section className="mech" id="live">
      <div className="mech-inner">
        <div className="io" data-dir="left">
          <span className="kicker" style={{ color: "var(--lime)" }}>
            Watch it work
          </span>
          <h2>See it happen.</h2>
          <p>
            Every number here is real. Usage happens, payment follows, right
            away.
          </p>
        </div>

        <div className="io" data-dir="right">
          <div className="floaty">
            <div className="dash-card">
              <div className="dash-top">
                <span className="dash-title">Live session</span>
                <span className="live-pill">
                  <span className="dot" />
                  metering
                </span>
              </div>
              <div className="dash-total">
                <span>$</span> 2.14
              </div>
              <div className="dash-sub">
                Settled this session, in CELO equivalent
              </div>
              <SettlementLog entries={SESSION_LOG} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
