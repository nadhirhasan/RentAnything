// Trip price estimate shown on the vehicle page (docs/SPEC.md §5.1).
// Pure functions: no imports, so they run under `node --test` as well.

export type PricingInput = {
  price_per_day: number;
  km_per_day: number | null; // null = unlimited
  extra_km_rate: number | null;
  min_days: number;
  weekly_price: number | null; // total for 7 days
  weekly_km: number | null; // null = unlimited
  monthly_price: number | null; // total for 30 days
  monthly_km: number | null; // null = unlimited
  driver_available: boolean;
  driver_price_per_day: number | null;
};

export type Plan = 'daily' | 'weekly' | 'monthly';

export type TripEstimate = {
  days: number; // days charged (at least min_days)
  minDaysApplied: boolean;
  plan: Plan;
  base: number;
  freeKm: number | null; // null = unlimited
  extraKm: number;
  extraKmCost: number;
  driverCost: number;
  total: number;
};

type Option = { plan: Plan; base: number; freeKm: number | null };

function planOptions(p: PricingInput, days: number): Option[] {
  const options: Option[] = [
    {
      plan: 'daily',
      base: days * p.price_per_day,
      freeKm: p.km_per_day == null ? null : days * p.km_per_day,
    },
  ];
  // Long-term offers are priced per 7 / 30 days and pro-rated for longer hires.
  if (p.weekly_price != null && days >= 7) {
    options.push({
      plan: 'weekly',
      base: Math.round((p.weekly_price * days) / 7),
      freeKm: p.weekly_km == null ? null : Math.round((p.weekly_km * days) / 7),
    });
  }
  if (p.monthly_price != null && days >= 30) {
    options.push({
      plan: 'monthly',
      base: Math.round((p.monthly_price * days) / 30),
      freeKm: p.monthly_km == null ? null : Math.round((p.monthly_km * days) / 30),
    });
  }
  return options;
}

export function estimateTrip(
  p: PricingInput,
  requestedDays: number,
  totalKm: number,
  withDriver: boolean,
): TripEstimate {
  const wanted = Math.max(1, Math.floor(requestedDays) || 1);
  const days = Math.max(wanted, p.min_days || 1);
  const km = Math.max(0, Math.round(totalKm) || 0);
  const driverCost =
    withDriver && p.driver_available ? days * (p.driver_price_per_day ?? 0) : 0;

  let best: TripEstimate | null = null;
  for (const o of planOptions(p, days)) {
    const extraKm = o.freeKm == null ? 0 : Math.max(0, km - o.freeKm);
    const extraKmCost = extraKm * (p.extra_km_rate ?? 0);
    const total = o.base + extraKmCost + driverCost;
    if (!best || total < best.total) {
      best = {
        days,
        minDaysApplied: days > wanted,
        plan: o.plan,
        base: o.base,
        freeKm: o.freeKm,
        extraKm,
        extraKmCost,
        driverCost,
        total,
      };
    }
  }
  return best!;
}

// The cheapest per-day price a listing offers, for "from Rs X / day" labels.
export function lowestDailyRate(p: Pick<PricingInput, 'price_per_day' | 'weekly_price' | 'monthly_price'>): number {
  const rates = [p.price_per_day];
  if (p.weekly_price != null) rates.push(p.weekly_price / 7);
  if (p.monthly_price != null) rates.push(p.monthly_price / 30);
  return Math.round(Math.min(...rates));
}

// The main price on cards and the vehicle page. Owners who only rent by the
// week or month (min_days 7+ / 30+) show that price, with the day rate under it.
export type HeadlinePrice = { amount: number; unit: 'day' | 'week' | 'month'; perDay: number | null };

export function headlinePrice(
  p: Pick<PricingInput, 'price_per_day' | 'min_days' | 'weekly_price' | 'monthly_price'>,
): HeadlinePrice {
  if (p.min_days >= 30) {
    const amount = p.monthly_price ?? p.price_per_day * 30;
    return { amount, unit: 'month', perDay: Math.round(amount / 30) };
  }
  if (p.min_days >= 7) {
    const amount = p.weekly_price ?? p.price_per_day * 7;
    return { amount, unit: 'week', perDay: Math.round(amount / 7) };
  }
  return { amount: p.price_per_day, unit: 'day', perDay: null };
}
