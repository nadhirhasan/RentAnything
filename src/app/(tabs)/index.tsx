import { router } from 'expo-router';
import { ChevronDown, CircleUser, MapPin, Search, SearchX, SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState, Screen } from '@/components/layout';
import { TownPicker } from '@/components/town-picker';
import { Button, Chip, Notice } from '@/components/ui';
import { VehicleCard } from '@/components/vehicle';
import { useFilters } from '@/lib/filters';
import { useUserLocation } from '@/lib/location';
import { friendlyError } from '@/lib/supabase';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  searchVehicles,
  VEHICLE_TYPES,
  type VehicleSummary,
  type VehicleType,
} from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

export default function ExploreScreen() {
  const { place, status, locateWithGps, chooseTown } = useUserLocation();
  const { filters, setFilters } = useFilters();
  const [pickingTown, setPickingTown] = useState(false);

  // Search box: update the shared filters 400 ms after typing stops.
  const [text, setText] = useState(filters.text);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== filters.text) setFilters({ ...filters, text });
    }, 400);
    return () => clearTimeout(t);
  }, [text, filters, setFilters]);

  // Results are tagged with the search they belong to, so "loading" is
  // simply "the results are for a different search than the current one".
  const queryKey = place ? JSON.stringify([place.lat, place.lng, filters]) : null;
  const [results, setResults] = useState<Results | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  // Only updates state once the request settles, so it's safe to start from
  // an effect. Responses from superseded requests are ignored.
  const fetchPage = useCallback(
    (key: string, nextPage: number) => {
      if (!place) return;
      const id = ++requestId.current;
      searchVehicles(place, filters, nextPage)
        .then(
          (rows) => {
            if (id !== requestId.current) return;
            setResults((prev) => {
              const append = nextPage > 0 && prev?.key === key;
              return {
                key,
                items: append ? [...prev.items, ...rows] : rows,
                total: rows[0]?.total_count ?? (append ? prev.total : 0),
                page: nextPage,
                error: null,
              };
            });
          },
          (e) => {
            if (id !== requestId.current) return;
            setResults((prev) =>
              nextPage > 0 && prev?.key === key
                ? { ...prev, error: friendlyError(e) }
                : { key, items: [], total: 0, page: 0, error: friendlyError(e) },
            );
          },
        )
        .finally(() => {
          if (id !== requestId.current) return;
          setLoadingMore(false);
          setRefreshing(false);
        });
    },
    [place, filters],
  );

  // New search whenever the location or filters change.
  useEffect(() => {
    if (queryKey) fetchPage(queryKey, 0);
  }, [queryKey, fetchPage]);

  const loading = queryKey != null && results?.key !== queryKey;
  const items = results?.items ?? [];
  const total = results?.total ?? 0;
  const error = results?.error ?? null;
  const hasMore = !loading && items.length < total;

  const loadMore = () => {
    if (!queryKey || !results || !hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchPage(queryKey, results.page + 1);
  };

  const reload = () => {
    if (queryKey) fetchPage(queryKey, 0);
  };

  const selectType = (t: VehicleType | null) => {
    const only = filters.types.length === 1 && filters.types[0] === t;
    setFilters({ ...filters, types: t == null || only ? [] : [t] });
  };

  const filterCount = activeFilterCount(filters);

  const header = (
    <View style={styles.resultsHeader}>
      <Text style={styles.count}>
        {loading ? 'Searching…' : `${total} available near you`}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setFilters({ ...filters, sortBy: filters.sortBy === 'nearest' ? 'price' : 'nearest' })
        }
        style={styles.sort}>
        <Text style={styles.sortText}>
          {filters.sortBy === 'nearest' ? 'Nearest first' : 'Lowest price'}
        </Text>
        <ChevronDown size={16} color={colors.primary} />
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change location"
            onPress={() => setPickingTown(true)}
            style={{ flex: 1, gap: 2 }}>
            <Text style={styles.locLabel}>Your location</Text>
            <View style={styles.locRow}>
              <MapPin size={18} color={colors.primary} />
              <Text style={styles.locText} numberOfLines={1}>
                {place ? place.label : 'Finding you…'}
              </Text>
              <ChevronDown size={18} color={colors.text2} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            onPress={() => router.navigate('/account')}
            style={styles.avatar}>
            <CircleUser size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Search size={18} color={colors.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Search van, car, town…"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search vehicles"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filters${filterCount ? `, ${filterCount} active` : ''}`}
            onPress={() => router.push('/filters')}
            style={styles.filterButton}>
            <SlidersHorizontal size={20} color={colors.white} />
            {filterCount ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{filterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={filters.types.length === 0} onPress={() => selectType(null)} />
          {VEHICLE_TYPES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={filters.types.includes(t.value)}
              onPress={() => selectType(t.value)}
            />
          ))}
        </ScrollView>
      </View>

      {status === 'denied' && place?.source === 'default' ? (
        <Pressable onPress={() => setPickingTown(true)} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Notice
            icon={MapPin}
            text="Location is off, so we're searching around Colombo. Tap to choose your town."
          />
        </Pressable>
      ) : null}

      {!place ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Finding vehicles near you…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VehicleCard v={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                reload();
              }}
            />
          }
          ListEmptyComponent={
            loading ? null : error ? (
              <EmptyState
                icon={SearchX}
                title="Couldn't load vehicles"
                text={error}
                action={<Button label="Try again" onPress={reload} />}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No vehicles found"
                text="Try removing some filters or searching a wider area."
                action={
                  filterCount || filters.text ? (
                    <Button
                      label="Clear filters"
                      kind="ghost"
                      onPress={() => {
                        setText('');
                        setFilters({ ...DEFAULT_FILTERS });
                      }}
                    />
                  ) : null
                }
              />
            )
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.primary} /> : null
          }
          initialNumToRender={PAGE_SIZE}
        />
      )}

      <TownPicker
        visible={pickingTown}
        title="Search near"
        onClose={() => setPickingTown(false)}
        onUseGps={() => {
          setPickingTown(false);
          locateWithGps();
        }}
        onPick={(t) => {
          setPickingTown(false);
          chooseTown(t);
        }}
      />
    </Screen>
  );
}

type Results = {
  key: string;
  items: VehicleSummary[];
  total: number;
  page: number;
  error: string | null;
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locLabel: { fontSize: 12, fontWeight: font.medium, color: colors.muted },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText: { fontSize: 17, fontWeight: font.semibold, color: colors.ink, flexShrink: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, minWidth: 0 },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: font.bold },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sortText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { fontSize: 14, color: colors.text2 },
});
