"use client";

import { TapoMark } from "./BrandMark";
import { useLiveCounter } from "./useLiveCounter";

type MeterDialProps = {
  /** Rendered size of the dial SVG in px. */
  size?: number;
  unitLabel?: string;
};

export function MeterDial({
  size = 264,
  unitLabel = "Units metered",
}: MeterDialProps) {
  const count = useLiveCounter();

  return (
    <div className="dial-card">
      <svg
        className="dial-svg"
        width={size}
        height={size}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <circle className="dial-track" cx="100" cy="100" r="88" />
        <circle className="dial-fill" cx="100" cy="100" r="88" />
      </svg>
      <div className="dial-center">
        <div className="count">{count}</div>
        <div className="unit">{unitLabel}</div>
      </div>
      <div className="dial-footer">
        <div className="tapo">
          <TapoMark />
          <span>Tapo, metering</span>
        </div>
        <span className="settled-tag">settled on Celo</span>
      </div>
    </div>
  );
}
