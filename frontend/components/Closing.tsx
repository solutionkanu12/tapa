import { ConnectButton } from "./wallet/ConnectButton";

export function Closing() {
  return (
    <section className="closing">
      <h2 className="io" data-dir="scale">
        Nothing flows until <span className="accent">you can pay for it.</span>
      </h2>
      <p className="io" data-dir="up" style={{ transitionDelay: ".1s" }}>
        Built on Celo, for anyone paying for what they use.
      </p>
      <div className="io" data-dir="up" style={{ transitionDelay: ".2s" }}>
        <ConnectButton className="btn-primary" label="Open the tap" />
      </div>
    </section>
  );
}
