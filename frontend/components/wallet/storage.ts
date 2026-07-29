import type { WalletId } from "./wallets";

const KEY = "tapa.lastWallet";

/**
 * Remembers which wallet the user last connected, so a reload can restore the
 * session without touching any other wallet. Without this, every page load
 * would poll the injected provider, which makes wallets like MetaMask log
 * connection errors when they are locked or still starting up.
 *
 * All access is guarded: localStorage throws in some private browsing modes.
 */
export function rememberWallet(id: WalletId): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Persistence is a convenience, never a requirement.
  }
}

export function readRememberedWallet(): WalletId | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return (value as WalletId) || null;
  } catch {
    return null;
  }
}

export function forgetWallet(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, the value simply stays until the browser clears it.
  }
}
