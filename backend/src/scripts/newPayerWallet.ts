import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Generates a fresh payer wallet and writes PAYER_PRIVATE_KEY into backend/.env.
 * The private key is never printed, only the public address, so it never has to
 * be pasted anywhere. Backs .env up to .env.bak before writing.
 */
const ENV_PATH = resolve(__dirname, "../../.env");

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

if (!existsSync(ENV_PATH)) {
  throw new Error(`${ENV_PATH} not found`);
}

copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);

const lines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
const nextLine = `PAYER_PRIVATE_KEY=${privateKey}`;
const existingIndex = lines.findIndex((line) => line.startsWith("PAYER_PRIVATE_KEY="));

if (existingIndex >= 0) {
  lines[existingIndex] = nextLine;
} else {
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push(nextLine, "");
}

writeFileSync(ENV_PATH, lines.join("\n"));

console.log("New payer wallet generated.");
console.log("Backed up previous .env to .env.bak");
console.log("");
console.log("  Fund THIS address with USDC on Celo mainnet:");
console.log("  " + account.address);
console.log("");
console.log("PAYER_PRIVATE_KEY has been written to backend/.env. It was not printed.");
