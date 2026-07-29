export function Closing() {
  return (
    <section className="closing">
      <h2 className="io" data-dir="scale">
        Nothing flows until <span className="accent">you can pay for it.</span>
      </h2>
      <p className="io" data-dir="up" style={{ transitionDelay: ".1s" }}>
        Built on Celo, for anyone paying for what they use.
      </p>
      <button
        type="button"
        className="btn-primary io"
        data-dir="up"
        style={{ transitionDelay: ".2s" }}
      >
        Open the tap
      </button>
    </section>
  );
}
