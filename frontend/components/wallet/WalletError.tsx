"use client";

import { useState } from "react";

import { useWallet } from "./WalletProvider";

/**
 * Surfaces connection failures. Renders nothing when there is no error, so it
 * has no effect on the landing page layout in the normal case.
 */
export function WalletError() {
  const { error, clearError } = useWallet();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!error || error === dismissed) return null;

  return (
    <div className="wallet-error" role="alert">
      <span className="msg">{error}</span>
      <button
        type="button"
        className="dismiss"
        onClick={() => {
          setDismissed(error);
          clearError();
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
