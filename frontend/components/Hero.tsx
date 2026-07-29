import { MeterDial } from "./MeterDial";
import { ConnectButton } from "./wallet/ConnectButton";

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
          <ConnectButton className="btn-primary" label="Open the tap →" />
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
