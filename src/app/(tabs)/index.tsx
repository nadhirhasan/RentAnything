import { router } from 'expo-router';
import {
  ArrowUpDown,
  ChevronDown,
  CircleUser,
  MapPin,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
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
import { OptionSheet } from '@/components/sheet';
import { TownPicker } from '@/components/town-picker';
import { Button, Chip, Notice, webNoOutline } from '@/components/ui';
import { VehicleCard, VehicleCardSkeleton } from '@/components/vehicle';
import { useFilters } from '@/lib/filters';
import { useUserLocation } from '@/lib/location';
import { friendlyError } from '@/lib/supabase';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  searchVehicles,
  VEHICLE_TYPES,
  type SortBy,
  type VehicleSummary,
  type VehicleType,
} from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

export default function ExploreScreen() {
  const { place, status, locateWithGps, chooseTown } = useUserLocation();
  const { filters, setFilters } = useFilters();
  const [pickingTown, setPickingTown] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);

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
        {loading ? 'Searching…' : `${total} ${total === 1 ? 'vehicle' : 'vehicles'} available`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${SORT_OPTIONS.find((o) => o.value === filters.sortBy)?.label}`}
        onPress={() => setSorting(true)}
        hitSlop={8}
        style={styles.sort}>
        <ArrowUpDown size={16} color={colors.primary} />
        <Text style={styles.sortText}>
          {SORT_OPTIONS.find((o) => o.value === filters.sortBy)?.label}
        </Text>
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
          <Pressable
            accessible={false}
            onPress={() => searchRef.current?.focus()}
            style={[styles.search, searchFocused && styles.searchFocused]}>
            <Search size={18} color={searchFocused ? colors.primary : colors.muted} />
            <TextInput
              ref={searchRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search van, car, town…"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, webNoOutline]}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search vehicles"
            />
            {text ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => {
                  setText('');
                  setFilters({ ...filters, text: '' });
                }}
                style={styles.clear}>
                <X size={14} color={colors.white} strokeWidth={3} />
              </Pressable>
            ) : null}
          </Pressable>
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
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={styles.count}>Finding vehicles near you…</Text>
          <VehicleCardSkeleton />
          <VehicleCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            // Dim old results while a new search runs.
            <View style={{ opacity: loading ? 0.5 : 1 }}>
              <VehicleCard v={item} />
            </View>
          )}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
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
            loading ? (
              <View style={{ gap: 12 }}>
                <VehicleCardSkeleton />
                <VehicleCardSkeleton />
              </View>
            ) : error ? (
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

      <OptionSheet
        visible={sorting}
        title="Sort by"
        options={SORT_OPTIONS}
        value={filters.sortBy}
        onSelect={(sortBy) => setFilters({ ...filters, sortBy })}
        onClose={() => setSorting(false)}
      />

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

const SORT_OPTIONS: { value: SortBy; label: string; description: string }[] = [
  { value: 'nearest', label: 'Nearest first', description: 'Closest available vehicles at the top' },
  { value: 'price', label: 'Lowest price', description: 'Cheapest price per day first' },
];

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
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.background,
  },
  searchFocused: { borderColor: colors.primary, backgroundColor: colors.white },
  searchInput: { flex: 1, alignSelf: 'stretch', fontSize: 15, color: colors.ink, minWidth: 0 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { fontSize: 14, color: colors.text2 },
});
