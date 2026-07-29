import { MeterDial } from "./MeterDial";

export function Hero() {
  return (
    <section className="hero">
      <div>
        <h1 className="io" data-dir="up">
          Pay for what flows.
          <br />
          The moment it <span className="accent">flows.</span>
        </h1>
        <p
          className="lede io"
          data-dir="up"
          style={{ transitionDelay: ".1s" }}
        >
          Tapa watches what you use and pays for it right away, before a bill
          ever has the chance to show up.
        </p>
        <div
          className="hero-actions io"
          data-dir="up"
          style={{ transitionDelay: ".2s" }}
        >
          <button type="button" className="btn-primary">
            Open the tap →
          </button>
          <a href="#how" className="btn-secondary">
            How it works
          </a>
        </div>
      </div>

      <div className="dial-stage io" data-dir="right">
        <div className="dial-glow" />
        <div className="floaty">
          <MeterDial />
        </div>
      </div>
    </section>
  );
}
