import { safeGet } from "./safe";
import type { Eip1193Provider } from "./types";

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
 * Extensions inject at different times, and some announce only in response to
 * a request. Re-asking a few times catches wallets that load after us without
 * making the page wait on them.
 */
const REQUEST_RETRY_DELAYS_MS = [0, 150, 600, 1500];

function isUsableAnnouncement(detail: unknown): detail is Eip6963ProviderDetail {
  if (!detail || typeof detail !== "object") return false;

  const info = safeGet(
    () => (detail as Eip6963ProviderDetail).info as unknown,
    null
  );
  const provider = safeGet(
    () => (detail as Eip6963ProviderDetail).provider as unknown,
    null
  );

  if (!info || typeof info !== "object" || !provider) return false;

  const uuid = safeGet(() => (info as Eip6963ProviderInfo).uuid, "");
  const rdns = safeGet(() => (info as Eip6963ProviderInfo).rdns, "");
  const request = safeGet(
    () => (provider as Eip1193Provider).request as unknown,
    undefined
  );

  return (
    typeof uuid === "string" &&
    uuid.length > 0 &&
    typeof rdns === "string" &&
    rdns.length > 0 &&
    typeof request === "function"
  );
}

/**
 * Collects wallets that announce themselves over EIP-6963.
 *
 * This is the only detection mechanism. It exists precisely so that several
 * extensions can coexist: each announces its own identity and its own provider
 * instance, with no shared global for them to fight over.
 *
 * Every announcement is validated and handled in isolation, so a wallet that
 * announces malformed data cannot stop others from being discovered.
 */
export function createRegistry(
  onChange: (entries: Eip6963ProviderDetail[]) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const byUuid = new Map<string, Eip6963ProviderDetail>();
  const seenRdns = new Set<string>();
  let disposed = false;

  const handleAnnouncement = (event: Event) => {
    if (disposed) return;
    try {
      const detail = safeGet(
        () => (event as CustomEvent<unknown>).detail,
        null
      );
      if (!isUsableAnnouncement(detail)) return;

      const { uuid, rdns } = detail.info;
      // Some wallets announce repeatedly, and a few announce the same wallet
      // under more than one uuid. Keep the first of each.
      if (byUuid.has(uuid)) return;
      const key = rdns.toLowerCase();
      if (seenRdns.has(key)) return;

      byUuid.set(uuid, detail);
      seenRdns.add(key);
      onChange([...byUuid.values()]);
    } catch {
      // A single bad announcement must never break discovery for the rest.
    }
  };

  try {
    window.addEventListener("eip6963:announceProvider", handleAnnouncement);
  } catch {
    return () => {};
  }

  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const delay of REQUEST_RETRY_DELAYS_MS) {
    timers.push(
      setTimeout(() => {
        if (disposed) return;
        try {
          window.dispatchEvent(new Event("eip6963:requestProvider"));
        } catch {
          // Nothing to do, any wallet that already announced is still known.
        }
      }, delay)
    );
  }

  return () => {
    disposed = true;
    timers.forEach(clearTimeout);
    try {
      window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
    } catch {
      // Listener removal failing is harmless once disposed is set.
    }
  };
}
