import type { Eip6963ProviderDetail } from "./registry";
import { safeFlag, safeGet } from "./safe";
import type { Eip1193Provider } from "./types";
import type { WalletOption } from "./wallets";

export type Resolution =
  /** The wallet announced itself. This provider instance is definitely it. */
  | { kind: "announced"; provider: Eip1193Provider; icon: string | null }
  /** Identified through a guarded legacy path, for wallets predating EIP-6963. */
  | { kind: "legacy"; provider: Eip1193Provider; icon: string | null }
  /** Not present. The caller should offer the wallet's download page. */
  | { kind: "missing" };

/** Finds the announcement belonging to a wallet, by rdns first, then by name. */
export function findAnnouncement(
  wallet: WalletOption,
  entries: Eip6963ProviderDetail[]
): Eip6963ProviderDetail | null {
  const wanted = wallet.rdns.map((r) => r.toLowerCase());

  const byRdns = entries.find((entry) =>
    wanted.includes(safeGet(() => entry.info.rdns.toLowerCase(), ""))
  );
  if (byRdns) return byRdns;

  // rdns strings are easy to get wrong, and the announced display name is
  // stable and human meaningful, so it is a dependable second key.
  const byName = entries.find((entry) =>
    safeGet(() => entry.info.name.toLowerCase(), "").includes(wallet.nameMatch)
  );
  return byName ?? null;
}

/**
 * Resolves the exact provider to connect for a wallet.
 *
 * EIP-6963 is the only path that can identify a wallet among several installed
 * extensions, so it is tried first and its provider instance is used verbatim.
 * window.ethereum is never consulted when an announcement matched: getLegacy is
 * lazy and simply is not called in that case.
 *
 * The legacy path exists only for wallets that predate EIP-6963, and only when
 * their identity can still be established. It deliberately refuses to hand back
 * an ambiguous shared provider, because doing so is how a user ends up
 * connected to a different wallet than the one they picked.
 */
export function resolveWallet(
  wallet: WalletOption,
  entries: Eip6963ProviderDetail[],
  getLegacy: () => Eip1193Provider | null
): Resolution {
  const announced = findAnnouncement(wallet, entries);
  if (announced) {
    const icon = safeGet(() => announced.info.icon, "");
    return {
      kind: "announced",
      provider: announced.provider,
      icon: icon.startsWith("data:") ? icon : null,
    };
  }

  const policy = wallet.legacy;
  if (!policy) return { kind: "missing" };

  const provider = getLegacy();
  if (!provider) return { kind: "missing" };

  // Never claim a provider another wallet already announced. Without this, an
  // unannounced wallet could be resolved to a rival extension's instance.
  const alreadyClaimed = entries.some((entry) => entry.provider === provider);
  if (alreadyClaimed) return { kind: "missing" };

  // A vendor flag proves identity outright.
  if (policy.flag && safeFlag(provider, policy.flag)) {
    return { kind: "legacy", provider, icon: null };
  }

  // Otherwise only accept it when there is nothing to confuse it with, which
  // is the in-app browser case: one wallet, no announcements.
  if (policy.allowWhenSoleProvider && entries.length === 0) {
    return { kind: "legacy", provider, icon: null };
  }

  return { kind: "missing" };
}

/** True when the wallet is present and can be connected right now. */
export function isAvailable(resolution: Resolution): boolean {
  return resolution.kind !== "missing";
}
