import { router, useFocusEffect } from 'expo-router';
import { Calendar, Car, Check, Eye, EyeOff, Info, Pencil, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { Button, Chip, Divider, Notice, Tag, Toggle } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { colomboDate, formatDateShort, formatLKR } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { getMyListings, isSwitchedOn, setAvailability, type MyListing } from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

const BACK_ON_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'No date', days: null },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
  { label: 'In a month', days: 30 },
];

export default function MyVehiclesScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<MyListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      setItems(await getMyListings());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  // Reload whenever the tab is shown (e.g. after adding or editing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session) {
    return (
      <Screen>
        <Header />
        <SignInPrompt
          title="List your vehicle"
          text="Sign in to list your vehicles for free and get calls from people nearby."
        />
      </Screen>
    );
  }

  const today = colomboDate();
  const onCount = items?.filter((l) => !l.is_hidden && isSwitchedOn(l, today)).length ?? 0;

  const update = (id: string, patch: Partial<MyListing>) =>
    setItems((prev) => prev?.map((l) => (l.id === id ? { ...l, ...patch } : l)) ?? null);

  return (
    <Screen>
      <Header
        subtitle={items?.length ? `${onCount} of ${items.length} showing in search` : undefined}
        showAdd
      />
      {items == null ? (
        error ? (
          <EmptyState icon={Car} title="Couldn't load your vehicles" text={error} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListHeaderComponent={
            items.length ? (
              <Notice
                icon={Info}
                text="Switch a vehicle off when it's out on hire. It disappears from search, so you won't get calls."
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Car}
              title="List your first vehicle"
              text="Add your van, car or any vehicle with its price and details. Customers nearby can find it and call you."
              action={
                <Button label="Add a vehicle" icon={Plus} onPress={() => router.push('/listing/new')} style={{ alignSelf: 'stretch' }} />
              }
            />
          }
          renderItem={({ item }) => (
            <OwnerVehicleCard listing={item} today={today} onChange={(patch) => update(item.id, patch)} />
          )}
        />
      )}
    </Screen>
  );
}

function Header({ subtitle, showAdd }: { subtitle?: string; showAdd?: boolean }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.heading}>My vehicles</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {showAdd ? <Button label="Add" icon={Plus} size="sm" onPress={() => router.push('/listing/new')} /> : null}
    </View>
  );
}

function OwnerVehicleCard({
  listing: l,
  today,
  onChange,
}: {
  listing: MyListing;
  today: string;
  onChange: (patch: Partial<MyListing>) => void;
}) {
  const on = isSwitchedOn(l, today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = l.vehicle_details;

  const save = async (nextOn: boolean, backOn: string | null) => {
    const before = { is_available: l.is_available, available_again_on: l.available_again_on };
    onChange({ is_available: nextOn, available_again_on: nextOn ? null : backOn });
    setSaving(true);
    setError(null);
    try {
      await setAvailability(l.id, nextOn, backOn);
    } catch (e) {
      onChange(before);
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const status = l.is_hidden ? (
    <Tag label="Hidden by admin" icon={EyeOff} />
  ) : on ? (
    <Tag label="Showing in search" icon={Check} tone="success" />
  ) : (
    <Tag label="Hidden from search" icon={EyeOff} />
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <VehiclePhoto path={l.listing_photos[0]?.path} seed={l.id} style={styles.thumb} iconSize={26} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={1}>
            {l.title}
          </Text>
          {v ? (
            <Text style={styles.sub}>
              {formatLKR(v.price_per_day)}/day · {v.seats} seats
            </Text>
          ) : null}
          {status}
        </View>
      </View>
      <Divider />
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.toggleTitle}>Available for rent</Text>
          <Text style={styles.small}>
            {on ? 'Customers can see and call you' : "Switched off — you won't get calls"}
          </Text>
        </View>
        <Toggle value={on} onChange={(next) => save(next, null)} disabled={saving} label="Available for rent" />
      </View>

      {!on ? (
        <View style={styles.backOn}>
          <View style={[styles.row, { gap: 8 }]}>
            <Calendar size={18} color={colors.text2} />
            <Text style={[styles.small, { flex: 1, fontSize: 14 }]}>Back on automatically</Text>
            <Text style={styles.backOnDate}>
              {l.available_again_on ? formatDateShort(l.available_again_on) : 'Not set'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {BACK_ON_OPTIONS.map((o) => {
              const date = o.days == null ? null : colomboDate(o.days);
              return (
                <Chip
                  key={o.label}
                  label={o.label}
                  selected={l.available_again_on === date}
                  onPress={() => save(false, date)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {error ? <Notice tone="danger" text={error} /> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Edit"
          kind="ghost"
          size="sm"
          icon={Pencil}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/listing/[id]/edit', params: { id: l.id } })}
        />
        <Button
          label="Preview"
          kind="ghost"
          size="sm"
          icon={Eye}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: l.id } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  heading: { fontSize: 24, fontWeight: font.bold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2 },
  small: { fontSize: 12, color: colors.text2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  toggleTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  backOn: { gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  backOnDate: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
});
