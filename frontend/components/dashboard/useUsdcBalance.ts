"use client";

import { useEffect, useState } from "react";

import { useWallet } from "../wallet/WalletProvider";

/** Native USDC on Celo mainnet, the asset settlements are denominated in. */
const USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDC_DECIMALS = 6;
const BALANCE_OF_SELECTOR = "0x70a08231";
const REFRESH_MS = 15000;

/**
 * Reads the connected wallet's USDC balance straight from the chain, through
 * the wallet's own provider. Returns null while unknown rather than showing a
 * placeholder number.
 */
export function useUsdcBalance(): number | null {
  const { address, status, request } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  const connected = status === "connected" && Boolean(address);

  useEffect(() => {
    if (!connected || !address) return;

    let cancelled = false;

    const read = async () => {
      const data = `${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
      const result = await request({
        method: "eth_call",
        params: [{ to: USDC_ADDRESS, data }, "latest"],
      });

      if (cancelled) return;

      if (!result.ok || typeof result.value !== "string") {
        setBalance(null);
        return;
      }

      try {
        setBalance(Number(BigInt(result.value)) / 10 ** USDC_DECIMALS);
      } catch {
        setBalance(null);
      }
    };

    void read();
    const timer = setInterval(() => void read(), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address, connected, request]);

  // Derived, so a disconnect never leaves a stale balance on screen.
  return connected ? balance : null;
}
