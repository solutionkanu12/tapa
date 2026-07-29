export type WalletId =
  | "minipay"
  | "valora"
  | "okx"
  | "metamask"
  | "trust"
  | "coinbase"
  | "rabby"
  | "uniswap";

/**
 * When and how a wallet may be resolved without an EIP-6963 announcement.
 *
 * Only granted to wallets that genuinely predate the standard. Every other
 * wallet must announce itself, because falling back to the shared
 * window.ethereum among several installed extensions is precisely how a user
 * ends up connected to a wallet they did not pick.
 */
export type LegacyPolicy = {
  /** Vendor flag that proves identity, checked defensively. */
  flag?: string;
  /** Accept the injected provider when nothing announced, ie an in-app browser. */
  allowWhenSoleProvider?: boolean;
};

export type WalletOption = {
  id: WalletId;
  name: string;
  /** Fallback badge text, used only when no brand icon is available. */
  badge: string;
  badgeColor: string;
  /** Bundled brand mark. Sourced from @web3icons/core (MIT). */
  iconSrc?: string;
  installUrl: string;
  /**
   * EIP-6963 rdns values to match. Hints only; matching also falls back to the
   * announced display name, which is more stable than hard-coded rdns strings.
   */
  rdns: string[];
  /** Lowercased substring matched against the announced display name. */
  nameMatch: string;
  legacy?: LegacyPolicy;
};

export const WALLETS: WalletOption[] = [
  {
    id: "minipay",
    name: "MiniPay",
    badge: "MP",
    badgeColor: "#D6FF4F",
    installUrl: "https://www.opera.com/products/minipay",
    rdns: ["co.opera.minipay"],
    nameMatch: "minipay",
    // Runs as an in-app browser and predates EIP-6963, so it is allowed a
    // guarded legacy path. isMiniPay is documented and proven in this app.
    legacy: { flag: "isMiniPay", allowWhenSoleProvider: true },
  },
  {
    id: "valora",
    name: "Valora",
    badge: "V",
    badgeColor: "#B9AEFB",
    installUrl: "https://valora.xyz/",
    rdns: ["xyz.valora.app", "com.valoraapp"],
    nameMatch: "valora",
    // Mobile-first, normally reached over WalletConnect, and not confirmed to
    // announce over EIP-6963. Allowed a legacy path, but only when its own flag
    // is present or nothing else announced, so it can never claim another
    // extension's provider on desktop.
    legacy: { flag: "isValora", allowWhenSoleProvider: true },
  },
  {
    id: "okx",
    name: "OKX Wallet",
    badge: "OKX",
    badgeColor: "#F3F0FA",
    iconSrc: "/wallet-icons/okx.svg",
    installUrl: "https://www.okx.com/web3",
    rdns: ["com.okex.wallet", "com.okx.wallet"],
    nameMatch: "okx",
  },
  {
    id: "metamask",
    name: "MetaMask",
    badge: "MM",
    badgeColor: "#FF5D5D",
    iconSrc: "/wallet-icons/metamask.svg",
    installUrl: "https://metamask.io/download/",
    rdns: ["io.metamask", "io.metamask.flask"],
    nameMatch: "metamask",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    badge: "TW",
    badgeColor: "#B9AEFB",
    iconSrc: "/wallet-icons/trust.svg",
    installUrl: "https://trustwallet.com/download",
    rdns: ["com.trustwallet.app"],
    nameMatch: "trust",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    badge: "CB",
    badgeColor: "#B9AEFB",
    iconSrc: "/wallet-icons/coinbase.svg",
    installUrl: "https://www.coinbase.com/wallet/downloads",
    rdns: ["com.coinbase.wallet"],
    nameMatch: "coinbase",
  },
  {
    id: "rabby",
    name: "Rabby",
    badge: "RB",
    badgeColor: "#D6FF4F",
    iconSrc: "/wallet-icons/rabby.svg",
    installUrl: "https://rabby.io/",
    rdns: ["io.rabby"],
    nameMatch: "rabby",
  },
  {
    id: "uniswap",
    name: "Uniswap Wallet",
    badge: "UNI",
    badgeColor: "#FF5D5D",
    installUrl: "https://wallet.uniswap.org/",
    rdns: ["org.uniswap.app", "com.uniswap.wallet"],
    nameMatch: "uniswap",
  },
];

export function walletById(id: WalletId): WalletOption | null {
  return WALLETS.find((w) => w.id === id) ?? null;
}
