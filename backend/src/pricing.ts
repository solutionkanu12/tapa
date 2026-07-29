import "dotenv/config";

// Rate is USDC per unit. Overridable per unit type so the settlement cost of a
// demo session can be tuned without touching pricing logic, since every
// settlement now spends real USDC on Celo mainnet.
//
// The default is deliberately a demo-safe rate rather than a realistic utility
// price. It is what an environment with no WATER_RATE_USDC set will spend per
// unit on mainnet, so the failure mode of forgetting to configure it should be
// an underspend, not a drained wallet.
const DEFAULT_RATES: Record<string, number> = {
  water: 0.0001,
};

const ENV_RATE_KEYS: Record<string, string> = {
  water: "WATER_RATE_USDC",
};

function getRate(unitType: string): number | undefined {
  const envKey = ENV_RATE_KEYS[unitType];
  const envValue = envKey ? process.env[envKey] : undefined;

  if (envValue !== undefined && envValue !== "") {
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${envKey} must be a positive number, got "${envValue}"`);
    }
    return parsed;
  }

  return DEFAULT_RATES[unitType];
}

export function getPrice(unitType: string, quantity: number): number {
  const rate = getRate(unitType);
  if (rate === undefined) {
    throw new Error(`No price rate configured for unit type "${unitType}"`);
  }
  return rate * quantity;
}
