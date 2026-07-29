"use client";

import { useState } from "react";

const MIN_LIMIT = 0.001;
const MAX_LIMIT = 0.5;
const STEP = 0.001;

type SpendingLimitProps = {
  /** Server-held limit for the running session, null before one exists. */
  serverLimit: number | null;
  totalSettled: number;
  sessionActive: boolean;
  starting: boolean;
  onStart: (limit: number) => void;
  onChange: (limit: number) => void;
};

/**
 * The session spending ceiling. Before metering starts this chooses the limit
 * the session opens with; afterwards it patches the live session, and the
 * agent service enforces it by reserving each amount before settling.
 */
export function SpendingLimit({
  serverLimit,
  totalSettled,
  sessionActive,
  starting,
  onStart,
  onChange,
}: SpendingLimitProps) {
  const [draft, setDraft] = useState(0.01);
  const [adoptedLimit, setAdoptedLimit] = useState<number | null>(null);

  // Adopt the server's value when it changes, so the control always reflects
  // what is actually being enforced. Adjusting state during render is the
  // supported way to react to a changed prop, and avoids the extra pass an
  // effect would cause.
  if (serverLimit !== null && serverLimit !== adoptedLimit) {
    setAdoptedLimit(serverLimit);
    setDraft(serverLimit);
  }

  const spentPct =
    serverLimit && serverLimit > 0
      ? Math.min(100, (totalSettled / serverLimit) * 100)
      : 0;

  return (
    <div className="ceiling-card">
      <h4>Session ceiling</h4>

      <div className="ceiling-row">
        <div className="limit-value">{draft.toFixed(3)} USDC</div>
        {sessionActive ? (
          <span className="spent-of">
            {totalSettled.toFixed(6)} spent, {spentPct.toFixed(0)}%
          </span>
        ) : null}
      </div>

      <input
        className="limit-slider"
        type="range"
        min={MIN_LIMIT}
        max={MAX_LIMIT}
        step={STEP}
        value={draft}
        disabled={starting}
        aria-label="Session spending limit in USDC"
        onChange={(event) => setDraft(Number(event.target.value))}
        onMouseUp={() => sessionActive && onChange(draft)}
        onTouchEnd={() => sessionActive && onChange(draft)}
        onKeyUp={() => sessionActive && onChange(draft)}
      />

      {sessionActive ? (
        <p className="limit-hint">
          Tapa stops settling once continuing would pass this ceiling. Changes
          apply to the running session immediately.
        </p>
      ) : (
        <>
          <p className="limit-hint">
            The most Tapa may spend this session. Every settlement is real USDC
            on Celo mainnet.
          </p>
          <button
            type="button"
            className="start-btn"
            disabled={starting}
            onClick={() => onStart(draft)}
          >
            {starting ? "Opening the tap..." : "Open the tap"}
          </button>
        </>
      )}
    </div>
  );
}
