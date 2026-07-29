"use client";

import { useLiveCounter } from "./useLiveCounter";

export function ProofRing() {
  const count = useLiveCounter();

  return (
    <div className="proof-ring-wrap floaty">
      <svg className="proof-ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="dial-track" cx="100" cy="100" r="88" />
        <circle className="dial-fill" cx="100" cy="100" r="88" />
      </svg>
      <div className="proof-ring-center">
        <div className="count mono">{count}</div>
        <div className="unit">Units metered, live</div>
      </div>
    </div>
  );
}
