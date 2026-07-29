import type { Eip1193Provider } from "./types";

export type WalletId =
  | "minipay"
  | "valora"
  | "okx"
  | "metamask"
  | "trust"
  | "coinbase"
  | "rabby"
  | "uniswap";

export type WalletOption = {
  id: WalletId;
  name: string;
  /** Short badge text, following the prototype's initial-badge pattern. */
  badge: string;
  badgeColor: string;
  installUrl: string;
  /**
   * EIP-6963 rdns values to match against. Treated as hints only; matching also
   * falls back to the announced display name, which is far more dependable than
   * hard-coding rdns strings.
   */
  rdns: string[];
  /** Lowercased substring matched against the EIP-6963 announced name. */
  nameMatch: string;
  /**
   * Legacy detection, used only when EIP-6963 finds nothing. Confidence in each
   * flag is documented in detectLegacy below.
   */
  legacy: (win: Window) => Eip1193Provider | null;
};

/**
 * Vendor flags wallets set on their injected provider. All optional, because
 * none of them are guaranteed to be present.
 */
type WalletFlags = {
  isRabby?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isOkxWallet?: boolean;
  isUniswapWallet?: boolean;
  isValora?: boolean;
};

type FlaggedProvider = Eip1193Provider & WalletFlags;

type InjectedWindow = Window & {
  ethereum?: FlaggedProvider & { providers?: FlaggedProvider[] };
  okxwallet?: Eip1193Provider;
  trustwallet?: Eip1193Provider;
  coinbaseWalletExtension?: Eip1193Provider;
  rabby?: Eip1193Provider;
  uniswap?: Eip1193Provider;
};

/**
 * Some extensions coexist by exposing an array on window.ethereum.providers.
 * This searches that array as well as the root provider.
 */
function fromEthereum(
  win: Window,
  predicate: (p: FlaggedProvider) => boolean
): Eip1193Provider | null {
  const root = (win as InjectedWindow).ethereum;
  if (!root) return null;
  const candidates: FlaggedProvider[] = [...(root.providers ?? []), root];
  return candidates.find((p) => predicate(p)) ?? null;
}

export const WALLETS: WalletOption[] = [
  {
    id: "minipay",
    name: "MiniPay",
    badge: "MP",
    badgeColor: "#D6FF4F",
    installUrl: "https://www.opera.com/products/minipay",
    rdns: ["co.opera.minipay"],
    nameMatch: "minipay",
    // Documented by Celo and MiniPay, and already proven by the auto-connect
    // path in this app.
    legacy: (win) => fromEthereum(win, (p) => Boolean(p.isMiniPay)),
  },
  {
    id: "valora",
    name: "Valora",
    badge: "V",
    badgeColor: "#B9AEFB",
    installUrl: "https://valora.xyz/",
    rdns: ["xyz.valora.app", "com.valoraapp"],
    nameMatch: "valora",
    // Valora is mobile-first and normally reached over WalletConnect. No
    // injected flag is confirmed, so this is a best guess and will usually
    // fall through to the generic provider or the install link.
    legacy: (win) => fromEthereum(win, (p) => Boolean(p.isValora)),
  },
  {
    id: "okx",
    name: "OKX Wallet",
    badge: "OKX",
    badgeColor: "#F3F0FA",
    installUrl: "https://www.okx.com/web3",
    rdns: ["com.okex.wallet", "com.okx.wallet"],
    nameMatch: "okx",
    // window.okxwallet is documented by OKX.
    legacy: (win) =>
      (win as InjectedWindow).okxwallet ??
      fromEthereum(win, (p) => Boolean(p.isOkxWallet)),
  },
  {
    id: "metamask",
    name: "MetaMask",
    badge: "MM",
    badgeColor: "#FF5D5D",
    installUrl: "https://metamask.io/download/",
    rdns: ["io.metamask"],
    nameMatch: "metamask",
    // isMetaMask is long-standing, but widely spoofed by other wallets, so
    // EIP-6963 is strongly preferred where available.
    legacy: (win) => fromEthereum(win, (p) => Boolean(p.isMetaMask)),
  },
  {
    id: "trust",
    name: "Trust Wallet",
    badge: "TW",
    badgeColor: "#B9AEFB",
    installUrl: "https://trustwallet.com/download",
    rdns: ["com.trustwallet.app"],
    nameMatch: "trust",
    // window.trustwallet and isTrust are both documented by Trust.
    legacy: (win) =>
      (win as InjectedWindow).trustwallet ??
      fromEthereum(win, (p) => Boolean(p.isTrust || p.isTrustWallet)),
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    badge: "CB",
    badgeColor: "#B9AEFB",
    installUrl: "https://www.coinbase.com/wallet/downloads",
    rdns: ["com.coinbase.wallet"],
    nameMatch: "coinbase",
    // coinbaseWalletExtension and isCoinbaseWallet are both documented.
    legacy: (win) =>
      (win as InjectedWindow).coinbaseWalletExtension ??
      fromEthereum(win, (p) => Boolean(p.isCoinbaseWallet)),
  },
  {
    id: "rabby",
    name: "Rabby",
    badge: "RB",
    badgeColor: "#D6FF4F",
    installUrl: "https://rabby.io/",
    rdns: ["io.rabby"],
    nameMatch: "rabby",
    // isRabby is believed correct but unverified here.
    legacy: (win) => fromEthereum(win, (p) => Boolean(p.isRabby)),
  },
  {
    id: "uniswap",
    name: "Uniswap Wallet",
    badge: "UNI",
    badgeColor: "#FF5D5D",
    installUrl: "https://wallet.uniswap.org/",
    rdns: ["org.uniswap.app", "com.uniswap.wallet"],
    nameMatch: "uniswap",
    // No confirmed injected flag. Expected to resolve through EIP-6963.
    legacy: (win) => fromEthereum(win, (p) => Boolean(p.isUniswapWallet)),
  },
];

export function walletById(id: WalletId): WalletOption {
  const wallet = WALLETS.find((w) => w.id === id);
  if (!wallet) throw new Error(`Unknown wallet: ${id}`);
  return wallet;
}
