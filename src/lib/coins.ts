// RentAnything coins (docs/SPEC.md §16). Owners' fees and payments are kept
// in rupees; the app shows them as coins (1 coin = coin_value rupees).
// Pure: no runtime imports, so `node --test` can run it.

export type FeeRules = {
  percent: number; // e.g. 5
  cap: number; // rupees, 0 = no cap
  coinValue: number; // rupees per coin
  freeLeft: number; // free rentals the owner still has
};

// Rupees → coins, with at most one decimal (fees are always whole coins).
export function toCoins(rupees: number, coinValue: number): number {
  return Math.round((rupees / Math.max(1, coinValue)) * 10) / 10;
}

// "1 coin", "1,240 coins", "-35 coins".
export function formatCoins(coins: number): string {
  const n = Math.abs(coins) === 1 ? 'coin' : 'coins';
  return `${coins.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${n}`;
}

// The wallet: positive = coins the owner has, negative = coins they owe.
export function walletCoins(balanceRupees: number, coinValue: number): number {
  const c = toCoins(-balanceRupees, coinValue);
  return c === 0 ? 0 : c; // no "-0"
}

// Same maths as rental_fee() in the database, for previews.
export function rentalFee(totalRupees: number, r: FeeRules): number {
  if (r.freeLeft > 0) return 0;
  const raw = Math.round((totalRupees * r.percent) / 100);
  const capped = r.cap > 0 ? Math.min(raw, r.cap) : raw;
  return Math.round(capped / r.coinValue) * r.coinValue;
}

export function freeRentalsLeft(freeRentals: number, verified: number): number {
  return Math.max(0, freeRentals - verified);
}

// Coin packs to buy; the amount owed (rounded up to 10 coins) comes first.
export const COIN_PACKS = [500, 1000, 2000, 5000];

export function topUpPacks(owedCoins: number): number[] {
  if (owedCoins <= 0) return [...COIN_PACKS];
  const due = Math.ceil(owedCoins / 10) * 10;
  const bigger = [...COIN_PACKS, 10000, 20000, 50000].filter((p) => p > due);
  return [due, ...bigger].slice(0, 4);
}

// Owners can owe up to `dues_limit` rupees (shown as coins of credit) before
// their vehicles are hidden. Before that the app only reminds them to top up.
export function creditUsed(balanceRupees: number, limitRupees: number, coinValue: number) {
  const used = Math.max(0, toCoins(balanceRupees, coinValue));
  const limit = Math.max(1, toCoins(limitRupees, coinValue));
  return { used, limit, left: Math.max(0, limit - used), fraction: Math.min(1, used / limit) };
}
