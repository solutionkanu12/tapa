import type { Eip1193Provider } from "./types";

/**
 * Every interaction with a wallet provider goes through these helpers.
 *
 * Injected providers are foreign objects. A property can be a getter that
 * throws, a method can be missing, and a request can reject or hang. With
 * several extensions installed, one misbehaving wallet must never be able to
 * break the picker or another wallet's connection, so nothing here throws.
 */

/** Reads a value that may throw, falling back instead of propagating. */
export function safeGet<T>(read: () => T, fallback: T): T {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/** Reads a vendor boolean flag off a provider without trusting the getter. */
export function safeFlag(provider: unknown, flag: string): boolean {
  return safeGet(
    () => Boolean((provider as Record<string, unknown>)?.[flag]),
    false
  );
}

export type RequestResult =
  | { ok: true; value: unknown }
  | { ok: false; error: unknown };

/**
 * Calls provider.request, converting every failure mode, including a missing
 * method or a synchronous throw, into a resolved result. Callers therefore
 * cannot produce an unhandled rejection.
 */
export async function safeRequest(
  provider: Eip1193Provider | null | undefined,
  args: { method: string; params?: unknown[] | Record<string, unknown> },
  timeoutMs = 30_000
): Promise<RequestResult> {
  if (!provider) return { ok: false, error: new Error("no provider") };

  try {
    const request = safeGet(() => provider.request, undefined);
    if (typeof request !== "function") {
      return { ok: false, error: new Error("provider has no request method") };
    }

    // A wallet that never settles would otherwise leave the UI spinning.
    const value = await Promise.race([
      Promise.resolve(request.call(provider, args)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${args.method} timed out`)),
          timeoutMs
        )
      ),
    ]);

    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Subscribes to a provider event, returning a no-op unsubscribe on failure. */
export function safeOn(
  provider: Eip1193Provider | null | undefined,
  event: string,
  handler: (...args: unknown[]) => void
): () => void {
  if (!provider) return () => {};

  try {
    const on = safeGet(() => provider.on, undefined);
    if (typeof on !== "function") return () => {};
    on.call(provider, event, handler);
  } catch {
    return () => {};
  }

  return () => {
    try {
      const off = safeGet(() => provider.removeListener, undefined);
      if (typeof off === "function") off.call(provider, event, handler);
    } catch {
      // Nothing useful to do if the wallet refuses to release the listener.
    }
  };
}

/**
 * Reads window.ethereum without assuming it is safe to touch. An extension can
 * define it as a throwing getter, or lock it, and several extensions racing to
 * define it is exactly the situation this app has to survive.
 *
 * This is only ever called on the legacy path, after EIP-6963 has produced no
 * match for the wallet the user actually picked.
 */
export function safeReadInjected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return safeGet<Eip1193Provider | null>(
    () => (window as { ethereum?: Eip1193Provider }).ethereum ?? null,
    null
  );
}
