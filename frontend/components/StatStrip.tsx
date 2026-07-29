const STATS = [
  { num: "Under 1¢", label: "Typical fee per settlement on Celo" },
  { num: "8M+", label: "MiniPay wallets already active" },
  { num: "25+", label: "Native stablecoins available for gas" },
  { num: "700K+", label: "Daily active users on Celo" },
];

export function StatStrip() {
  return (
    <section className="stat-strip" id="celo">
      <div className="stat-strip-head">
        <span className="kicker io" data-dir="up">
          Works anywhere Celo does
        </span>
      </div>
      <div className="stat-inner">
        {STATS.map((stat, index) => (
          <div
            className="stat io"
            data-dir="up"
            key={stat.num}
            style={{ transitionDelay: `${index * 0.08}s` }}
          >
            <div className="num">{stat.num}</div>
            <div className="label">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
