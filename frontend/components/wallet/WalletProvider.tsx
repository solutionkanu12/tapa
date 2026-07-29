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

import {
  listenForProviders,
  resolveProvider,
  type Eip6963ProviderDetail,
} from "./discovery";
import { planStartup } from "./startup";
import {
  forgetWallet,
  readRememberedWallet,
  rememberWallet,
} from "./storage";
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

function getInjected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function describeProvider(provider: Eip1193Provider): string {
  if (provider.isMiniPay) return "MiniPay";
  if (provider.isMetaMask) return "MetaMask";
  return "Injected wallet";
}

function toChainId(raw: unknown): number | null {
  if (typeof raw === "string") return Number.parseInt(raw, 16);
  if (typeof raw === "number") return raw;
  return null;
}

function isUserRejection(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === 4001;
}

function messageFor(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const candidate = err as { code?: unknown; message?: unknown };
    if (candidate.code === 4001) return "Connection request was rejected.";
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "Could not connect to a wallet.";
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Eip6963ProviderDetail[]>([]);

  // The provider actually connected to, which may not be window.ethereum when
  // several wallets are installed side by side.
  const activeProvider = useRef<Eip1193Provider | null>(null);
  const autoConnectAttempted = useRef(false);

  useEffect(() => {
    return listenForProviders((detail) => {
      setDiscovered((current) =>
        current.some((d) => d.info.uuid === detail.info.uuid)
          ? current
          : [...current, detail]
      );
    });
  }, []);

  const readChain = useCallback(async (provider: Eip1193Provider) => {
    try {
      const raw = await provider.request({ method: "eth_chainId" });
      const id = toChainId(raw);
      setChainId(id);
      return id;
    } catch {
      setChainId(null);
      return null;
    }
  }, []);

  /**
   * Moves the wallet onto Celo mainnet. Runs immediately after connecting, so
   * the only thing the user sees is their wallet's own approval prompt.
   */
  const ensureCeloChain = useCallback(
    async (provider: Eip1193Provider, currentChainId: number | null) => {
      if (currentChainId === CELO_MAINNET_CHAIN_ID) return;

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CELO_MAINNET_CHAIN_ID_HEX }],
        });
      } catch (err) {
        // 4902 means the wallet does not know Celo yet, so add it and retry.
        if ((err as { code?: unknown })?.code === 4902) {
          try {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [CELO_CHAIN_PARAMS],
            });
          } catch (addErr) {
            setError(
              isUserRejection(addErr)
                ? "Tapa settles on Celo. Approve the network switch in your wallet to continue."
                : "Could not add the Celo network to this wallet."
            );
            return;
          }
        } else {
          setError(
            isUserRejection(err)
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
      walletId?: WalletId
    ) => {
      const name = describeProvider(provider);
      activeProvider.current = provider;
      setAddress(accounts[0]);
      setWalletName(name);
      setIsMiniPay(Boolean(provider.isMiniPay));
      setStatus("connected");

      // Recorded so a reload can restore this wallet, and only this wallet.
      if (walletId) rememberWallet(walletId);

      const id = await readChain(provider);
      console.info(`[tapa] connected ${accounts[0]} via ${name}`);
      await ensureCeloChain(provider, id);
    },
    [ensureCeloChain, readChain]
  );

  /**
   * Connects a specific wallet, or the generic injected provider when no id is
   * given. Returns "missing" when the wallet could not be found, so the caller
   * can send the user to its download page instead of failing silently.
   */
  const connect = useCallback(
    async (walletId?: WalletId): Promise<"connected" | "missing" | "failed"> => {
      let provider: Eip1193Provider | null;

      if (walletId) {
        const resolution = resolveProvider(walletById(walletId), discovered);
        if (resolution.kind === "missing") return "missing";
        provider = resolution.provider;
      } else {
        provider = getInjected();
      }

      if (!provider) {
        setStatus("unsupported");
        setError(
          "No wallet found. Open Tapa inside MiniPay, or install a supported wallet."
        );
        return "missing";
      }

      setStatus("connecting");
      setError(null);

      try {
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];

        if (!accounts?.length) {
          setStatus("disconnected");
          setError("Wallet returned no accounts.");
          return "failed";
        }

        await attach(provider, accounts, walletId);
        return "connected";
      } catch (err) {
        setStatus("disconnected");
        setError(messageFor(err));
        return "failed";
      }
    },
    [attach, discovered]
  );

  /**
   * Clears local session state. EIP-1193 has no revoke method, so the wallet
   * itself stays authorised until the user disconnects from inside it.
   */
  const disconnect = useCallback(() => {
    activeProvider.current = null;
    // Stop restoring on the next load, the user asked to be disconnected.
    forgetWallet();
    setAddress(null);
    setChainId(null);
    setWalletName(null);
    setIsMiniPay(false);
    setError(null);
    setStatus("disconnected");
  }, []);

  /**
   * Startup behaviour, deliberately conservative.
   *
   * MiniPay auto-connects, because the page is running inside the wallet's own
   * browser and there is nothing to choose. Every other wallet is left
   * completely alone unless the user connected it before, which is recorded in
   * localStorage. A first visit therefore issues no provider calls at all,
   * which is what stops MetaMask logging connection errors on every load.
   */
  useEffect(() => {
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;

    let cancelled = false;

    (async () => {
      const injected = getInjected();
      const plan = planStartup({
        isMiniPay: Boolean(injected?.isMiniPay),
        remembered: readRememberedWallet(),
      });

      // No provider is contacted in the idle case, which is the whole point.
      if (plan.action === "idle") return;

      if (plan.action === "auto-connect") {
        await connect("minipay");
        return;
      }

      const remembered = plan.walletId;

      // Resolve the remembered wallet specifically, so an unrelated wallet is
      // never contacted. If it cannot be found there is nothing to restore.
      const resolution = resolveProvider(walletById(remembered), discovered);
      if (resolution.kind === "missing") return;

      try {
        const accounts = (await resolution.provider.request({
          method: "eth_accounts",
        })) as string[];

        if (cancelled) return;

        if (accounts?.length) {
          await attach(resolution.provider, accounts, remembered);
        } else {
          // Authorisation was revoked in the wallet, so stop trying.
          forgetWallet();
        }
      } catch {
        // The wallet is locked, still starting, or unavailable. Forget it so
        // the next load stays silent rather than retrying and erroring again.
        forgetWallet();
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount. Re-running would re-contact the wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local state in step with changes made inside the wallet itself.
  // Only ever listens to a wallet that is actually connected, so wallets the
  // user has not opted into are never touched.
  useEffect(() => {
    const provider = activeProvider.current;
    if (!provider?.on || !provider.removeListener) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (!accounts?.length) {
        disconnect();
        return;
      }
      setAddress(accounts[0]);
      setStatus("connected");
    };

    const onChainChanged = (...args: unknown[]) => {
      setChainId(toChainId(args[0]));
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [disconnect, status]);

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
