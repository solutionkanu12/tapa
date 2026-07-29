/**
 * Multi-wallet simulation.
 *
 * Reproduces a browser with several extensions installed at once, including a
 * deliberately hostile one, and checks the behaviour that matters in that
 * situation: the wallet the user picks is the wallet that connects, nothing
 * reads the shared window.ethereum when EIP-6963 has answered, and no
 * misbehaving extension can break the others.
 *
 * Run with: node scripts/testWallets.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();

function loadTs(absPath) {
  if (cache.has(absPath)) return cache.get(absPath).exports;

  const js = ts.transpileModule(readFileSync(absPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };
  cache.set(absPath, mod);

  const localRequire = (spec) => {
    if (!spec.startsWith(".")) return require(spec);
    const base = resolve(dirname(absPath), spec);
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return loadTs(candidate);
    }
    throw new Error(`cannot resolve ${spec} from ${absPath}`);
  };

  new Function("module", "exports", "require", js)(
    mod,
    mod.exports,
    localRequire
  );
  return mod.exports;
}

const W = "components/wallet";
const { resolveWallet, findAnnouncement } = loadTs(`${W}/resolution.ts`);
const { WALLETS, walletById } = loadTs(`${W}/wallets.ts`);
const { safeRequest, safeFlag, safeOn, safeGet } = loadTs(`${W}/safe.ts`);
const { createRegistry } = loadTs(`${W}/registry.ts`);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("use checkAsync");
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed += 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed += 1;
  }
}

// --- fake wallets -----------------------------------------------------------

function makeProvider(label, extra = {}) {
  return {
    label,
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return [`0xADDR_${label}`];
      if (method === "eth_accounts") return [`0xADDR_${label}`];
      if (method === "eth_chainId") return "0xa4ec";
      return null;
    },
    on: () => {},
    removeListener: () => {},
    ...extra,
  };
}

/** A wallet that throws on every property read and every call. */
function makeHostileProvider() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("hostile wallet: property access denied");
      },
      has() {
        throw new Error("hostile wallet: has() denied");
      },
    }
  );
}

function announcement(name, rdns, provider, uuid = `uuid-${rdns}`) {
  return { info: { uuid, name, rdns, icon: "data:image/svg+xml,<svg/>" }, provider };
}

const metamask = makeProvider("metamask", { isMetaMask: true });
const okx = makeProvider("okx");
const rabby = makeProvider("rabby");
const coinbase = makeProvider("coinbase");
const trust = makeProvider("trust");

// Five extensions installed at once, the realistic case.
const MULTI = [
  announcement("MetaMask", "io.metamask", metamask),
  announcement("OKX Wallet", "com.okex.wallet", okx),
  announcement("Rabby", "io.rabby", rabby),
  announcement("Coinbase Wallet", "com.coinbase.wallet", coinbase),
  announcement("Trust Wallet", "com.trustwallet.app", trust),
];

// With several extensions installed, whichever loaded last owns this.
const sharedWindowEthereum = metamask;
const legacyNever = () => {
  throw new Error("window.ethereum was read when it must not be");
};

console.log("=== requirement 2: exact wallet selection ===");

for (const [id, expected] of [
  ["metamask", metamask],
  ["okx", okx],
  ["rabby", rabby],
  ["coinbase", coinbase],
  ["trust", trust],
]) {
  check(`picking ${id} resolves that exact provider instance`, () => {
    const res = resolveWallet(walletById(id), MULTI, legacyNever);
    assert.equal(res.kind, "announced");
    assert.equal(res.provider, expected, "wrong provider instance");
  });
}

check("picking OKX never returns MetaMask, despite MetaMask owning window.ethereum", () => {
  const res = resolveWallet(walletById("okx"), MULTI, () => sharedWindowEthereum);
  assert.equal(res.provider, okx);
  assert.notEqual(res.provider, sharedWindowEthereum);
});

console.log();
console.log("=== requirement 4: window.ethereum untouched when EIP-6963 answers ===");

check("legacy getter is never invoked for an announced wallet", () => {
  let reads = 0;
  const counting = () => {
    reads += 1;
    return sharedWindowEthereum;
  };
  for (const id of ["metamask", "okx", "rabby", "coinbase", "trust"]) {
    resolveWallet(walletById(id), MULTI, counting);
  }
  assert.equal(reads, 0, `window.ethereum was read ${reads} time(s)`);
});

check("uninstalled wallet resolves missing, it does not grab window.ethereum", () => {
  // Uniswap did not announce. It must not fall back to MetaMask's provider.
  const res = resolveWallet(walletById("uniswap"), MULTI, () => sharedWindowEthereum);
  assert.equal(res.kind, "missing");
});

console.log();
console.log("=== requirement 3: isolation of misbehaving wallets ===");

check("a hostile provider does not break resolution of other wallets", () => {
  const hostile = makeHostileProvider();
  const entries = [
    ...MULTI,
    announcement("Hostile Wallet", "com.hostile", hostile, "uuid-hostile"),
  ];
  const res = resolveWallet(walletById("okx"), entries, legacyNever);
  assert.equal(res.provider, okx);
});

check("malformed announcements do not break matching", () => {
  const entries = [
    { info: null, provider: null },
    { info: { uuid: "x" } },
    ...MULTI,
  ];
  const res = resolveWallet(walletById("rabby"), entries, legacyNever);
  assert.equal(res.provider, rabby);
});

check("safeFlag on a hostile provider returns false rather than throwing", () => {
  assert.equal(safeFlag(makeHostileProvider(), "isMiniPay"), false);
});

check("safeGet swallows a throwing getter", () => {
  const bomb = {
    get boom() {
      throw new Error("nope");
    },
  };
  assert.equal(safeGet(() => bomb.boom, "fallback"), "fallback");
});

check("safeOn on a hostile provider returns a usable unsubscribe", () => {
  const off = safeOn(makeHostileProvider(), "accountsChanged", () => {});
  assert.equal(typeof off, "function");
  off();
});

await checkAsync("safeRequest resolves rather than rejecting on a hostile wallet", async () => {
  const result = await safeRequest(makeHostileProvider(), { method: "eth_accounts" });
  assert.equal(result.ok, false);
});

await checkAsync("safeRequest resolves when the provider rejects", async () => {
  const rejecting = { request: () => Promise.reject(new Error("locked")) };
  const result = await safeRequest(rejecting, { method: "eth_accounts" });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /locked/);
});

await checkAsync("safeRequest resolves when the provider throws synchronously", async () => {
  const thrower = {
    request: () => {
      throw new Error("sync boom");
    },
  };
  const result = await safeRequest(thrower, { method: "eth_accounts" });
  assert.equal(result.ok, false);
});

await checkAsync("safeRequest times out instead of hanging forever", async () => {
  const hanging = { request: () => new Promise(() => {}) };
  const result = await safeRequest(hanging, { method: "eth_accounts" }, 50);
  assert.equal(result.ok, false);
  assert.match(String(result.error), /timed out/);
});

console.log();
console.log("=== legacy path cannot hijack another wallet ===");

check("Valora does not claim MetaMask's provider when others announced", () => {
  const res = resolveWallet(walletById("valora"), MULTI, () => sharedWindowEthereum);
  assert.equal(res.kind, "missing");
});

check("Valora accepts the sole injected provider when nothing announced", () => {
  const valoraish = makeProvider("valora-inapp");
  const res = resolveWallet(walletById("valora"), [], () => valoraish);
  assert.equal(res.kind, "legacy");
  assert.equal(res.provider, valoraish);
});

check("MiniPay is accepted on its flag even alongside announcements", () => {
  const mini = makeProvider("minipay", { isMiniPay: true });
  const res = resolveWallet(walletById("minipay"), MULTI, () => mini);
  assert.equal(res.kind, "legacy");
  assert.equal(res.provider, mini);
});

check("MiniPay refuses a provider that is not MiniPay", () => {
  const res = resolveWallet(walletById("minipay"), MULTI, () => sharedWindowEthereum);
  assert.equal(res.kind, "missing");
});

check("legacy refuses a provider already claimed by an announcement", () => {
  // okx announced this instance, so Valora must not adopt it even alone.
  const res = resolveWallet(
    walletById("valora"),
    [announcement("OKX Wallet", "com.okex.wallet", okx)],
    () => okx
  );
  assert.equal(res.kind, "missing");
});

console.log();
console.log("=== requirement 1: real EIP-6963 handshake ===");

await checkAsync("registry discovers wallets that answer requestProvider", async () => {
  const listeners = new Map();
  const fakeWindow = {
    addEventListener: (type, fn) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type, fn) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
    },
    dispatchEvent: (event) => {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
  };

  globalThis.window = fakeWindow;

  // Three extensions, each announcing only when asked, as the spec describes.
  const installed = [
    announcement("MetaMask", "io.metamask", metamask),
    announcement("OKX Wallet", "com.okex.wallet", okx),
    announcement("Rabby", "io.rabby", rabby),
  ];

  fakeWindow.addEventListener("eip6963:requestProvider", () => {
    for (const detail of installed) {
      fakeWindow.dispatchEvent(
        Object.assign(new Event("eip6963:announceProvider"), { detail })
      );
    }
    // A hostile extension announcing garbage must not stop the others.
    fakeWindow.dispatchEvent(
      Object.assign(new Event("eip6963:announceProvider"), { detail: null })
    );
  });

  let latest = [];
  const dispose = createRegistry((entries) => {
    latest = entries;
  });

  await new Promise((r) => setTimeout(r, 30));
  dispose();
  delete globalThis.window;

  assert.equal(latest.length, 3, `discovered ${latest.length}, expected 3`);
  const names = latest.map((e) => e.info.name).sort();
  assert.deepEqual(names, ["MetaMask", "OKX Wallet", "Rabby"]);

  // And each resolves to its own instance.
  assert.equal(resolveWallet(walletById("okx"), latest, legacyNever).provider, okx);
  assert.equal(
    resolveWallet(walletById("metamask"), latest, legacyNever).provider,
    metamask
  );
});

check("duplicate announcements are collapsed", () => {
  const dupes = [
    announcement("MetaMask", "io.metamask", metamask, "uuid-a"),
    announcement("MetaMask", "io.metamask", metamask, "uuid-b"),
  ];
  // findAnnouncement returns one entry, and resolution is stable.
  assert.equal(findAnnouncement(walletById("metamask"), dupes).provider, metamask);
});

console.log();
console.log("=== every picker wallet is matchable by announcement ===");

for (const wallet of WALLETS) {
  check(`${wallet.name} matches its own announcement`, () => {
    const provider = makeProvider(wallet.id);
    const entries = [
      ...MULTI.filter((e) => !e.info.name.toLowerCase().includes(wallet.nameMatch)),
      announcement(wallet.name, wallet.rdns[0], provider, `uuid-${wallet.id}`),
    ];
    const res = resolveWallet(wallet, entries, legacyNever);
    assert.equal(res.kind, "announced");
    assert.equal(res.provider, provider);
  });
}

console.log();
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
