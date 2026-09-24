import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout';
import { Button, Chip, Group, RoundIconButton, Segmented, ToggleRow, Wrap } from '@/components/ui';
import { useFilters } from '@/lib/filters';
import { formatLKR } from '@/lib/format';
import { useUserLocation } from '@/lib/location';
import {
  countVehicles,
  DEFAULT_FILTERS,
  VEHICLE_TYPES,
  type DriverMode,
  type SearchFilters,
} from '@/lib/vehicles';
import { colors, font } from '@/theme';

const SEATS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 4, label: '4+' },
  { value: 7, label: '7+' },
  { value: 10, label: '10+' },
  { value: 14, label: '14+' },
];

const DRIVER: { value: DriverMode | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 'with_driver', label: 'With driver' },
  { value: 'self_drive', label: 'Self-drive' },
];

const MAX_PRICES = [null, 5000, 8000, 12000, 20000, 30000];
const DISTANCES = [10, 25, 50, 100, null];

export default function FiltersScreen() {
  const { filters, setFilters } = useFilters();
  const { place } = useUserLocation();
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Live "Show N vehicles" count for the draft filters. The count is tagged
  // with the draft it was computed for, so it's hidden while stale.
  const draftKey = JSON.stringify(draft);
  const [counted, setCounted] = useState<{ key: string; count: number } | null>(null);
  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const t = setTimeout(() => {
      countVehicles(place, JSON.parse(draftKey) as SearchFilters)
        .then((count) => !cancelled && setCounted({ key: draftKey, count }))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [place, draftKey]);
  const count = counted?.key === draftKey ? counted.count : null;

  const toggleType = (t: (typeof VEHICLE_TYPES)[number]['value']) =>
    set('types', draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t]);

  const apply = () => {
    setFilters(draft);
    router.back();
  };

  return (
    <Screen background={colors.white}>
      <View style={styles.top}>
        <RoundIconButton icon={X} label="Close" onPress={() => router.back()} background="transparent" size={40} />
        <Text style={styles.title}>Filters</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDraft({ ...DEFAULT_FILTERS, text: draft.text, sortBy: draft.sortBy })}
          hitSlop={8}>
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Group title="Vehicle type">
          <Wrap>
            <Chip label="All" selected={draft.types.length === 0} onPress={() => set('types', [])} />
            {VEHICLE_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={draft.types.includes(t.value)}
                onPress={() => toggleType(t.value)}
              />
            ))}
          </Wrap>
        </Group>

        <Group title="Seats">
          <Segmented options={SEATS} value={draft.minSeats} onChange={(v) => set('minSeats', v)} />
        </Group>

        <Group title="Driver">
          <Segmented options={DRIVER} value={draft.driverMode} onChange={(v) => set('driverMode', v)} />
        </Group>

        <Group title="Features">
          <View style={{ gap: 14 }}>
            <ToggleRow title="AC" value={draft.acOnly} onChange={(v) => set('acOnly', v)} />
            <ToggleRow
              title="Double seat"
              subtitle="Buddy van with 2 seat rows behind the driver"
              value={draft.doubleSeatOnly}
              onChange={(v) => set('doubleSeatOnly', v)}
            />
            <ToggleRow
              title="Unlimited km only"
              value={draft.unlimitedKmOnly}
              onChange={(v) => set('unlimitedKmOnly', v)}
            />
          </View>
        </Group>

        <Group title="Max price per day">
          <Wrap>
            {MAX_PRICES.map((p) => (
              <Chip
                key={String(p)}
                label={p == null ? 'Any' : `Up to ${formatLKR(p)}`}
                selected={draft.maxPricePerDay === p}
                onPress={() => set('maxPricePerDay', p)}
              />
            ))}
          </Wrap>
        </Group>

        <Group title="Distance">
          <Wrap>
            {DISTANCES.map((d) => (
              <Chip
                key={String(d)}
                label={d == null ? 'Anywhere' : `${d} km`}
                selected={draft.radiusKm === d}
                onPress={() => set('radiusKm', d)}
              />
            ))}
          </Wrap>
        </Group>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={count == null ? 'Show vehicles' : count === 0 ? 'No vehicles match' : `Show ${count} vehicle${count === 1 ? '' : 's'}`}
          onPress={apply}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 6,
  },
  title: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  reset: { fontSize: 15, fontWeight: font.semibold, color: colors.primary },
  body: { padding: 20, paddingTop: 8, gap: 22 },
  footer: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
