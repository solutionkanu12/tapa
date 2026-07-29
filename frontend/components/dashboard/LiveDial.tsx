"use client";

import { TapoMark } from "../BrandMark";

/** Matches the prototype dial's stroke-dasharray. */
const CIRCUMFERENCE = 552;

type LiveDialProps = {
  /** Real metered quantity for the session. */
  quantity: number;
  /** Spend so far, as a fraction of the session limit, drives the arc. */
  progress: number;
  metering: boolean;
};

/**
 * The session meter, driven by real settlement data rather than the landing
 * page's decorative animation. The arc shows how much of the spending limit
 * has been used, so the dial reaches full exactly when metering stops.
 */
export function LiveDial({ quantity, progress, metering }: LiveDialProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = CIRCUMFERENCE - CIRCUMFERENCE * clamped;

  return (
    <div className="dial-card" style={{ transform: "none" }}>
      <svg
        className="dial-svg"
        width={230}
        height={230}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <circle className="dial-track" cx="100" cy="100" r="88" />
        <circle
          className="dial-fill"
          cx="100"
          cy="100"
          r="88"
          // Driven by data, so the looping keyframe is switched off here.
          style={{
            animation: "none",
            strokeDashoffset: offset,
            transition: "stroke-dashoffset 0.6s ease",
          }}
        />
      </svg>
      <div className="dial-center">
        <div className="count">{quantity.toFixed(2)}</div>
        <div className="unit">Litres metered</div>
      </div>
      <div className="dial-footer">
        <div className="tapo">
          <TapoMark />
          <span>{metering ? "Tapo, metering" : "Tapo, idle"}</span>
        </div>
        <span className="settled-tag">settled on Celo</span>
      </div>
    </div>
  );
}
