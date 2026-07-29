import type { Eip1193Provider } from "./types";
import type { WalletOption } from "./wallets";

/** EIP-6963, Multi Injected Provider Discovery. */
export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

/**
 * Subscribes to EIP-6963 announcements and asks any already-loaded wallets to
 * re-announce. This is the dependable way to identify a specific wallet;
 * sniffing window flags is only a fallback, since several wallets spoof each
 * other's flags.
 */
export function listenForProviders(
  onProvider: (detail: Eip6963ProviderDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.info?.rdns && detail.provider) onProvider(detail);
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

/** Matches a discovered announcement to a wallet by rdns, then by name. */
export function matchDiscoveredDetail(
  wallet: WalletOption,
  discovered: Eip6963ProviderDetail[]
): Eip6963ProviderDetail | null {
  const byRdns = discovered.find((d) =>
    wallet.rdns.includes(d.info.rdns.toLowerCase())
  );
  if (byRdns) return byRdns;

  const byName = discovered.find((d) =>
    d.info.name.toLowerCase().includes(wallet.nameMatch)
  );
  return byName ?? null;
}

/** Matches a discovered provider to a wallet by rdns, then by announced name. */
export function matchDiscovered(
  wallet: WalletOption,
  discovered: Eip6963ProviderDetail[]
): Eip1193Provider | null {
  return matchDiscoveredDetail(wallet, discovered)?.provider ?? null;
}

/**
 * The wallet's own icon, as announced over EIP-6963. This is the most
 * trustworthy source of a brand mark, since the wallet ships it itself.
 */
export function announcedIcon(
  wallet: WalletOption,
  discovered: Eip6963ProviderDetail[]
): string | null {
  const icon = matchDiscoveredDetail(wallet, discovered)?.info.icon;
  return icon && icon.startsWith("data:") ? icon : null;
}

export type Resolution =
  | { kind: "exact"; provider: Eip1193Provider }
  | { kind: "generic"; provider: Eip1193Provider }
  | { kind: "missing" };

/**
 * Resolves the provider to use for a wallet.
 *
 * "exact" means the specific wallet was identified. "generic" means only an
 * unidentified injected provider is present, which is still worth trying since
 * an in-app browser usually injects exactly one wallet. "missing" means there
 * is nothing to connect to and the caller should offer the install link.
 */
export function resolveProvider(
  wallet: WalletOption,
  discovered: Eip6963ProviderDetail[]
): Resolution {
  if (typeof window === "undefined") return { kind: "missing" };

  const announced = matchDiscovered(wallet, discovered);
  if (announced) return { kind: "exact", provider: announced };

  const legacy = wallet.legacy(window);
  if (legacy) return { kind: "exact", provider: legacy };

  // Nothing identified this wallet specifically. If exactly one unidentified
  // injected provider exists, it is very likely the wallet whose browser we are
  // inside, so try it rather than sending the user to a download page.
  const injected = window.ethereum;
  if (injected && discovered.length === 0) {
    return { kind: "generic", provider: injected };
  }

  return { kind: "missing" };
}
