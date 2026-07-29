import { ProofRing } from "./ProofRing";
import { SettlementLog, type LogEntry } from "./SettlementLog";

const CARDS = [
  {
    num: "01",
    title: "Real usage, not guesses",
    body: "A live feed reports exactly what you used, not a rounded average.",
  },
  {
    num: "02",
    title: "Priced as it happens",
    body: "Tapa sets the price the moment you use something, not once a month.",
  },
  {
    num: "03",
    title: "Paid, not billed",
    body: "Money moves the second usage is confirmed. Nothing left to pay later.",
  },
];

const PROOF_LOG: LogEntry[] = [
  { unit: "0.6 L water", time: "just now", amount: "+0.03" },
  { unit: "2 min solar charge", time: "6s ago", amount: "+0.05" },
  { unit: "4 MB data", time: "14s ago", amount: "+0.02" },
];

export function ProblemSection() {
  return (
    <section className="section" id="problem">
      <div className="section-head io" data-dir="up">
        <span className="kicker">The problem</span>
        <h2>Bills ask for money before you have it.</h2>
        <p>
          Most billing works the same way: use it now, pay for it later, no
          matter what. Tapa flips that. You pay for exactly what you use, right
          when you use it.
        </p>
      </div>

      <div className="scatter-deck">
        {CARDS.map((card) => (
          <div className="scatter-card" key={card.num}>
            <div className="scatter-num">{card.num}</div>
            <div className="scatter-body">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="proof-block io" data-dir="scale">
        <ProofRing />
        <div className="proof-log">
          <span className="dash-title">Settlement log</span>
          <SettlementLog entries={PROOF_LOG} />
          <p className="proof-caption">
            No stock photo here. This is Tapa, just bigger.
          </p>
        </div>
      </div>
    </section>
  );
}
