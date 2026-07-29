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
  CELO_CHAIN_PARAMS,
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CHAIN_ID_HEX,
  type Eip1193Provider,
  type WalletState,
  type WalletStatus,
} from "./types";

const WalletContext = createContext<WalletState | null>(null);

function getProvider(): Eip1193Provider | null {
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

function messageFor(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const candidate = err as { code?: unknown; message?: unknown };
    // 4001 is the EIP-1193 user rejection code.
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

  // Guards the MiniPay auto-connect so it only ever fires once.
  const autoConnectAttempted = useRef(false);

  const readChain = useCallback(async (provider: Eip1193Provider) => {
    try {
      const raw = await provider.request({ method: "eth_chainId" });
      setChainId(toChainId(raw));
    } catch {
      setChainId(null);
    }
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setStatus("unsupported");
      setError(
        "No wallet found. Open Tapa inside MiniPay, or install MetaMask for desktop testing."
      );
      return;
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
        return;
      }

      const name = describeProvider(provider);
      setAddress(accounts[0]);
      setWalletName(name);
      setIsMiniPay(Boolean(provider.isMiniPay));
      await readChain(provider);
      setStatus("connected");

      // Temporary, so the connect flow can be confirmed while the dashboard
      // does not exist yet.
      console.info(`[tapa] connected ${accounts[0]} via ${name}`);
    } catch (err) {
      setStatus("disconnected");
      setError(messageFor(err));
    }
  }, [readChain]);

  /**
   * Clears local session state. EIP-1193 has no revoke method, so the wallet
   * itself stays authorised until the user disconnects from inside it.
   */
  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setWalletName(null);
    setIsMiniPay(false);
    setError(null);
    setStatus(getProvider() ? "disconnected" : "unsupported");
  }, []);

  const switchToCelo = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CELO_MAINNET_CHAIN_ID_HEX }],
      });
    } catch (err) {
      // 4902 means the chain is unknown to the wallet, so offer to add it.
      const code = (err as { code?: unknown })?.code;
      if (code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [CELO_CHAIN_PARAMS],
          });
        } catch (addErr) {
          setError(messageFor(addErr));
          return;
        }
      } else {
        setError(messageFor(err));
        return;
      }
    }

    await readChain(provider);
  }, [readChain]);

  // Restore an existing authorisation without prompting, and auto-connect
  // inside MiniPay, where the user is already in their wallet's browser.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const provider = getProvider();
      if (!provider) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      try {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[];

        if (cancelled) return;

        if (accounts?.length) {
          setAddress(accounts[0]);
          setWalletName(describeProvider(provider));
          setIsMiniPay(Boolean(provider.isMiniPay));
          await readChain(provider);
          setStatus("connected");
          return;
        }

        if (provider.isMiniPay && !autoConnectAttempted.current) {
          autoConnectAttempted.current = true;
          await connect();
        }
      } catch {
        // A silent restore failing is not worth surfacing to the user.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connect, readChain]);

  // Keep local state in step with changes made inside the wallet itself.
  useEffect(() => {
    const provider = getProvider();
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
  }, [disconnect]);

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
      connect,
      disconnect,
      switchToCelo,
    }),
    [
      status,
      address,
      chainId,
      walletName,
      isMiniPay,
      error,
      connect,
      disconnect,
      switchToCelo,
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
