import type { WalletId } from "./wallets";

/**
 * What the app should do on page load, before any wallet is contacted.
 *
 * Kept as a pure function so the rule that matters can be tested directly:
 * a fresh load with no remembered wallet must resolve to "idle", meaning no
 * provider call is issued at all. Contacting an injected wallet on every load
 * is what made MetaMask log connection errors when locked or still starting.
 */
export type StartupPlan =
  | { action: "auto-connect"; walletId: "minipay" }
  | { action: "restore"; walletId: WalletId }
  | { action: "idle" };

export function planStartup(input: {
  /** Whether the page is running inside MiniPay's browser. */
  isMiniPay: boolean;
  /** The wallet the user last connected, if any. */
  remembered: WalletId | null;
}): StartupPlan {
  // MiniPay is the wallet's own browser, so there is nothing to pick and
  // connecting immediately is the expected behaviour.
  if (input.isMiniPay) return { action: "auto-connect", walletId: "minipay" };

  // Only a wallet the user previously connected may be contacted silently.
  if (input.remembered) {
    return { action: "restore", walletId: input.remembered };
  }

  // Never touch an injected provider the user has not opted into.
  return { action: "idle" };
}
