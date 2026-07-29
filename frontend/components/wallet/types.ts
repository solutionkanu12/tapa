/** Celo mainnet, the only chain Tapa settles on. */
export const CELO_MAINNET_CHAIN_ID = 42220;
export const CELO_MAINNET_CHAIN_ID_HEX = "0xa4ec";

export const CELO_CHAIN_PARAMS = {
  chainId: CELO_MAINNET_CHAIN_ID_HEX,
  chainName: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: ["https://forno.celo.org"],
  blockExplorerUrls: ["https://celoscan.io"],
} as const;

/** Minimal EIP-1193 surface, which is all MiniPay and MetaMask need here. */
export type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => void;
  isMiniPay?: boolean;
  isMetaMask?: boolean;
};

export type WalletStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected";

export type WalletState = {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  /** Human readable name of the injected wallet, for display and debugging. */
  walletName: string | null;
  isMiniPay: boolean;
  /** True when connected but pointed at a chain other than Celo mainnet. */
  isWrongChain: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToCelo: () => Promise<void>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** Shortens an address to the 0x71...4F2 form used across the UI. */
export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
