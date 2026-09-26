// Owner badges and success score (docs/SPEC.md §16).
import type { LucideIcon } from 'lucide-react-native';
import { Award, Crown, ShieldCheck, TrendingUp } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { scoreLabel, tierLabel, type Tier } from '@/lib/reputation';
import { colors, font, radius } from '@/theme';

const TIER_STYLE: Record<Tier, { icon: LucideIcon; bg: string; fg: string }> = {
  rising: { icon: TrendingUp, bg: colors.success50, fg: colors.success700 },
  top_rated: { icon: Award, bg: colors.primary100, fg: colors.primary },
  top_rated_plus: { icon: Crown, bg: '#F3E8FF', fg: '#7E22CE' },
};

export function scoreColor(score: number): string {
  if (score >= 90) return colors.success700;
  if (score >= 70) return '#B45309';
  return colors.danger;
}

export function TierBadge({ tier, large }: { tier: string | null | undefined; large?: boolean }) {
  const label = tierLabel(tier);
  if (!label) return null;
  const s = TIER_STYLE[tier as Tier];
  const Icon = s.icon;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }, large && styles.badgeLarge]}>
      <Icon size={large ? 16 : 13} color={s.fg} strokeWidth={2.4} />
      <Text style={[styles.badgeText, { color: s.fg }, large && { fontSize: 14 }]}>{label}</Text>
    </View>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  const label = scoreLabel(score);
  if (!label || score == null) return null;
  const c = scoreColor(score);
  return (
    <View style={[styles.badge, { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }]}>
      <ShieldCheck size={13} color={c} strokeWidth={2.4} />
      <Text style={[styles.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

// "96%  ████████░  Success score"
export function ScoreMeter({ score, caption }: { score: number | null; caption?: string }) {
  if (score == null) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={styles.meterNone}>No success score yet</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    );
  }
  const c = scoreColor(score);
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`Success score ${score} percent`}>
      <View style={styles.meterRow}>
        <Text style={[styles.meterValue, { color: c }]}>{score}%</Text>
        <Text style={styles.meterLabel}>Success score</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(3, Math.min(100, score))}%`, backgroundColor: c }]} />
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeLarge: { paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: font.bold },
  meterRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  meterValue: { fontSize: 28, fontWeight: font.bold },
  meterLabel: { fontSize: 14, fontWeight: font.semibold, color: colors.text2 },
  meterNone: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  caption: { fontSize: 13, color: colors.text2, lineHeight: 18 },
});
