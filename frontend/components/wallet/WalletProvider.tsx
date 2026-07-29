"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createRegistry, type Eip6963ProviderDetail } from "./registry";
import { resolveWallet } from "./resolution";
import {
  safeFlag,
  safeOn,
  safeReadInjected,
  safeRequest,
} from "./safe";
import { planStartup } from "./startup";
import { forgetWallet, readRememberedWallet, rememberWallet } from "./storage";
import {
  CELO_CHAIN_PARAMS,
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CHAIN_ID_HEX,
  type Eip1193Provider,
  type WalletState,
  type WalletStatus,
} from "./types";
import { walletById, type WalletId } from "./wallets";

const WalletContext = createContext<WalletState | null>(null);

function toChainId(raw: unknown): number | null {
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 16);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof raw === "number") return raw;
  return null;
}

function isUserRejection(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 4001;
}

function messageFor(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const candidate = err as { code?: unknown; message?: unknown };
    if (candidate.code === 4001) return "Connection request was rejected.";
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "Could not connect to that wallet.";
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Eip6963ProviderDetail[]>([]);

  /**
   * The exact provider instance in use. Held separately from window.ethereum,
   * which with several extensions installed may belong to a different wallet
   * entirely.
   */
  const activeProvider = useRef<Eip1193Provider | null>(null);
  const startupAttempted = useRef(false);

  useEffect(() => createRegistry(setDiscovered), []);

  const readChain = useCallback(async (provider: Eip1193Provider) => {
    const result = await safeRequest(provider, { method: "eth_chainId" });
    const id = result.ok ? toChainId(result.value) : null;
    setChainId(id);
    return id;
  }, []);

  /**
   * Moves the wallet onto Celo mainnet straight after connecting, so the only
   * thing the user sees is their wallet's own approval prompt.
   */
  const ensureCeloChain = useCallback(
    async (provider: Eip1193Provider, currentChainId: number | null) => {
      if (currentChainId === CELO_MAINNET_CHAIN_ID) return;

      const switched = await safeRequest(provider, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CELO_MAINNET_CHAIN_ID_HEX }],
      });

      if (!switched.ok) {
        // 4902 means the wallet does not know Celo yet, so add it.
        if ((switched.error as { code?: unknown })?.code === 4902) {
          const added = await safeRequest(provider, {
            method: "wallet_addEthereumChain",
            params: [CELO_CHAIN_PARAMS],
          });
          if (!added.ok) {
            setError(
              isUserRejection(added.error)
                ? "Tapa settles on Celo. Approve the network switch in your wallet to continue."
                : "Could not add the Celo network to this wallet."
            );
            return;
          }
        } else {
          setError(
            isUserRejection(switched.error)
              ? "Tapa settles on Celo. Approve the network switch in your wallet to continue."
              : "Could not switch this wallet to Celo."
          );
          return;
        }
      }

      await readChain(provider);
    },
    [readChain]
  );

  const attach = useCallback(
    async (
      provider: Eip1193Provider,
      accounts: string[],
      walletId: WalletId,
      displayName: string
    ) => {
      activeProvider.current = provider;
      setAddress(accounts[0]);
      setWalletName(displayName);
      setIsMiniPay(safeFlag(provider, "isMiniPay"));
      setStatus("connected");

      // Recorded so a reload can restore this wallet, and only this wallet.
      rememberWallet(walletId);

      const id = await readChain(provider);
      console.info(`[tapa] connected ${accounts[0]} via ${displayName}`);
      await ensureCeloChain(provider, id);
    },
    [ensureCeloChain, readChain]
  );

  /**
   * Connects the wallet the user picked, using that wallet's own announced
   * provider instance. Never throws: every failure is reported as a value.
   */
  const connect = useCallback(
    async (walletId?: WalletId): Promise<"connected" | "missing" | "failed"> => {
      const wallet = walletId ? walletById(walletId) : null;
      if (!wallet) return "missing";

      // getLegacy is lazy on purpose: when the wallet announced itself over
      // EIP-6963, window.ethereum is never read at all.
      const resolution = resolveWallet(wallet, discovered, safeReadInjected);
      if (resolution.kind === "missing") return "missing";

      setStatus("connecting");
      setError(null);

      const result = await safeRequest(resolution.provider, {
        method: "eth_requestAccounts",
      });

      if (!result.ok) {
        setStatus("disconnected");
        setError(messageFor(result.error));
        return "failed";
      }

      const accounts = Array.isArray(result.value)
        ? (result.value as string[])
        : [];

      if (!accounts.length || typeof accounts[0] !== "string") {
        setStatus("disconnected");
        setError(`${wallet.name} returned no accounts.`);
        return "failed";
      }

      await attach(resolution.provider, accounts, wallet.id, wallet.name);
      return "connected";
    },
    [attach, discovered]
  );

  /**
   * Clears local session state. EIP-1193 has no revoke method, so the wallet
   * itself stays authorised until the user disconnects from inside it.
   */
  const disconnect = useCallback(() => {
    activeProvider.current = null;
    forgetWallet();
    setAddress(null);
    setChainId(null);
    setWalletName(null);
    setIsMiniPay(false);
    setError(null);
    setStatus("disconnected");
  }, []);

  /**
   * Startup, deliberately conservative. MiniPay connects automatically because
   * the page runs inside its own browser. Every other wallet is left untouched
   * unless the user connected it before, so a first visit issues no provider
   * calls and no extension has any reason to log an error.
   */
  useEffect(() => {
    if (startupAttempted.current) return;

    const remembered = readRememberedWallet();
    const injected = safeReadInjected();
    const plan = planStartup({
      isMiniPay: safeFlag(injected, "isMiniPay"),
      remembered,
    });

    if (plan.action === "idle") {
      startupAttempted.current = true;
      return;
    }

    // Restoring needs the announced provider, which may not have arrived yet,
    // so wait for discovery rather than reaching for a shared global.
    const wallet = walletById(plan.walletId);
    if (!wallet) {
      startupAttempted.current = true;
      return;
    }

    const resolution = resolveWallet(wallet, discovered, safeReadInjected);
    if (resolution.kind === "missing") {
      // Still waiting on announcements. Give them a moment before giving up.
      const timer = setTimeout(() => {
        if (startupAttempted.current) return;
        startupAttempted.current = true;
        if (plan.action === "restore") forgetWallet();
      }, 2500);
      return () => clearTimeout(timer);
    }

    startupAttempted.current = true;
    let cancelled = false;

    (async () => {
      if (plan.action === "auto-connect") {
        await connect(plan.walletId);
        return;
      }

      const result = await safeRequest(resolution.provider, {
        method: "eth_accounts",
      });

      if (cancelled) return;

      const accounts =
        result.ok && Array.isArray(result.value)
          ? (result.value as string[])
          : [];

      if (accounts.length && typeof accounts[0] === "string") {
        await attach(resolution.provider, accounts, wallet.id, wallet.name);
      } else {
        // Authorisation revoked, wallet locked, or unavailable. Forget it so
        // the next load stays silent instead of retrying and erroring again.
        forgetWallet();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discovered, connect, attach]);

  // Track changes made inside the connected wallet. Only ever listens to the
  // provider actually in use, so other extensions are never touched.
  useEffect(() => {
    const provider = activeProvider.current;
    if (!provider) return;

    const offAccounts = safeOn(provider, "accountsChanged", (...args) => {
      const accounts = args[0];
      if (!Array.isArray(accounts) || !accounts.length) {
        disconnect();
        return;
      }
      setAddress(accounts[0] as string);
      setStatus("connected");
    });

    const offChain = safeOn(provider, "chainChanged", (...args) => {
      setChainId(toChainId(args[0]));
    });

    return () => {
      offAccounts();
      offChain();
    };
  }, [disconnect, status]);

  /** Read-only passthrough to the connected provider, never throws. */
  const request = useCallback(
    (args: { method: string; params?: unknown[] | Record<string, unknown> }) =>
      safeRequest(activeProvider.current, args),
    []
  );

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      chainId,
      walletName,
      isMiniPay,
      isWrongChain:
        status === "connected" &&
        chainId !== null &&
        chainId !== CELO_MAINNET_CHAIN_ID,
      error,
      discovered,
      connect,
      disconnect,
      clearError: () => setError(null),
      request,
    }),
    [
      status,
      address,
      chainId,
      walletName,
      isMiniPay,
      error,
      discovered,
      connect,
      disconnect,
      request,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside a WalletProvider");
  }
  return context;
}
