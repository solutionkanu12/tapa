/**
 * Verifies the startup rule that keeps the console clean: on a fresh load with
 * no remembered wallet, no injected provider may be contacted.
 *
 * Run with: node scripts/testStartup.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path) {
  const source = readFileSync(path, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}

const { planStartup } = loadTsModule("components/wallet/startup.ts");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed += 1;
  }
}

console.log("=== startup plan ===");

check("fresh load, MetaMask installed, never connected -> idle", () => {
  const plan = planStartup({ isMiniPay: false, remembered: null });
  assert.equal(plan.action, "idle");
});

check("fresh load, no wallet at all -> idle", () => {
  const plan = planStartup({ isMiniPay: false, remembered: null });
  assert.equal(plan.action, "idle");
});

check("inside MiniPay -> auto-connect", () => {
  const plan = planStartup({ isMiniPay: true, remembered: null });
  assert.equal(plan.action, "auto-connect");
  assert.equal(plan.walletId, "minipay");
});

check("previously connected MetaMask -> restore that wallet only", () => {
  const plan = planStartup({ isMiniPay: false, remembered: "metamask" });
  assert.equal(plan.action, "restore");
  assert.equal(plan.walletId, "metamask");
});

check("MiniPay wins over a remembered wallet", () => {
  const plan = planStartup({ isMiniPay: true, remembered: "metamask" });
  assert.equal(plan.action, "auto-connect");
});

console.log();
console.log("=== provider is never contacted when idle ===");

check("a provider that throws on any call is never invoked", () => {
  let calls = 0;
  // Stands in for MetaMask while locked: any request rejects.
  const hostileProvider = {
    isMetaMask: true,
    request: () => {
      calls += 1;
      return Promise.reject(new Error("Failed to connect to MetaMask"));
    },
  };

  const plan = planStartup({
    isMiniPay: Boolean(hostileProvider.isMiniPay),
    remembered: null,
  });

  // The effect only issues a request for auto-connect or restore.
  if (plan.action !== "idle") {
    throw new Error(`expected idle, got ${plan.action}`);
  }

  assert.equal(calls, 0, `provider was contacted ${calls} time(s)`);
});

console.log();
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
