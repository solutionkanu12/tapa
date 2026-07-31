import "dotenv/config";
import { getPrice } from "../pricing.js";

const EXPECTED_DEFAULT = 0.0001;
const OLD_DEFAULT = 0.05;

function rateFor(): number {
  // getPrice multiplies rate by quantity, so quantity 1 yields the rate itself.
  return getPrice("water", 1);
}

function main() {
  console.log(`.env WATER_RATE_USDC: ${process.env.WATER_RATE_USDC ?? "(not set)"}`);
  const withEnv = rateFor();
  console.log(`rate with .env applied:   ${withEnv.toFixed(6)} USDC/unit`);

  // The rate is resolved per call, so clearing the variable exercises the
  // hardcoded default exactly as a deploy with no env var configured would.
  delete process.env.WATER_RATE_USDC;
  const withoutEnv = rateFor();
  console.log(`rate with env var unset:  ${withoutEnv.toFixed(6)} USDC/unit`);
  console.log("");

  const pass = Math.abs(withoutEnv - EXPECTED_DEFAULT) < 1e-12;
  console.log(`expected default:         ${EXPECTED_DEFAULT.toFixed(6)}`);
  console.log(`old default was:          ${OLD_DEFAULT.toFixed(6)}`);
  console.log(`RESULT: ${pass ? "PASS" : "FAIL"} - unconfigured deploy would charge ${withoutEnv.toFixed(6)}/unit`);

  // Sanity check the scaling still works off the default.
  const scaled = getPrice("water", 2.2);
  const scaledOk = Math.abs(scaled - EXPECTED_DEFAULT * 2.2) < 1e-12;
  console.log(`quantity 2.2 -> ${scaled.toFixed(6)} USDC  ${scaledOk ? "OK" : "MISMATCH"}`);

  if (!pass || !scaledOk) process.exitCode = 1;
}

main();
