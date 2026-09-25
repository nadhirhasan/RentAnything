// Owner success score and badges, like Upwork (docs/SPEC.md §16). The score
// is computed in the database (owner_reputation); this file only describes it.
// Pure: no runtime imports, so `node --test` can run it.

export type Tier = 'top_rated_plus' | 'top_rated' | 'rising';

export const TIERS: Record<Tier, { label: string; minScore: number; minRentals: number }> = {
  rising: { label: 'Rising Star', minScore: 80, minRentals: 1 },
  top_rated: { label: 'Top Rated', minScore: 90, minRentals: 5 },
  top_rated_plus: { label: 'Top Rated Plus', minScore: 90, minRentals: 20 },
};

export const MIN_OUTCOMES = 3;

export function tierLabel(tier: string | null | undefined): string | null {
  return tier && tier in TIERS ? TIERS[tier as Tier].label : null;
}

// "96% success"
export function scoreLabel(score: number | null | undefined): string | null {
  return score == null ? null : `${score}% success`;
}

// What the owner still needs for the next badge, in plain words.
export function nextTier(
  score: number | null,
  rentals: number,
  tier: string | null,
): { label: string; needs: string[] } | null {
  const order: Tier[] = ['rising', 'top_rated', 'top_rated_plus'];
  const current = tier && tier in TIERS ? order.indexOf(tier as Tier) : -1;
  const next = order[current + 1];
  if (!next) return null;
  const t = TIERS[next];
  const needs: string[] = [];
  if (score == null) needs.push(`a success score (after ${MIN_OUTCOMES} rentals or reviews)`);
  else if (score < t.minScore) needs.push(`${t.minScore}% success score (you have ${score}%)`);
  if (rentals < t.minRentals) {
    const more = t.minRentals - rentals;
    needs.push(`${more} more rental${more === 1 ? '' : 's'} started with the code`);
  }
  return { label: t.label, needs };
}
