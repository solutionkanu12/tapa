"use client";

import { useEffect } from "react";

import { Dashboard } from "./dashboard/Dashboard";
import { useWallet } from "./wallet/WalletProvider";

/**
 * Swaps the whole view when a wallet connects, mirroring the prototype where
 * the landing page is replaced by the dashboard rather than updated in place.
 *
 * The landing page is passed in as an element so it stays server rendered and
 * is simply not mounted while the dashboard is showing.
 */
export function AppShell({ landing }: { landing: React.ReactNode }) {
  const { status } = useWallet();
  const connected = status === "connected";

  // The landing page and the dashboard are different documents in spirit, so
  // reset scroll on the swap the way a navigation would.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [connected]);

  return connected ? <Dashboard /> : <>{landing}</>;
}
