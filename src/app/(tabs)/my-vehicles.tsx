import { router, useFocusEffect } from 'expo-router';
import { Calendar, Car, Check, Eye, EyeOff, Info, MessageCircle, Pencil, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { OptionSheet } from '@/components/sheet';
import { Button, Divider, Notice, Skeleton, Tag, Toggle } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { colomboDate, formatDateShort, formatLKR } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { contactSupport, hasSupport } from '@/lib/support';
import { confirmHire, getRecentContacts, type RecentContact } from '@/lib/trust';
import { getMyListings, isSwitchedOn, setAvailability, type MyListing } from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

// value = days from today; 0 = no date (owner switches it back on).
const BACK_ON_OPTIONS: { label: string; value: number }[] = [
  { label: 'Not sure yet', value: 0 },
  { label: 'Tomorrow', value: 1 },
  { label: 'In 3 days', value: 3 },
  { label: 'In a week', value: 7 },
  { label: 'In 2 weeks', value: 14 },
  { label: 'In a month', value: 30 },
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
          <View style={{ padding: 16, gap: 12 }}>
            <OwnerCardSkeleton />
            <OwnerCardSkeleton />
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
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [renters, setRenters] = useState<RecentContact[] | null>(null);
  const v = l.vehicle_details;

  const save = async (nextOn: boolean, backOn: string | null) => {
    const before = { is_available: l.is_available, available_again_on: l.available_again_on };
    onChange({ is_available: nextOn, available_again_on: nextOn ? null : backOn });
    setSaving(true);
    setError(null);
    try {
      await setAvailability(l.id, nextOn, backOn);
      toast(
        nextOn
          ? 'Showing in search again'
          : backOn
            ? `Hidden until ${formatDateShort(backOn)}`
            : 'Hidden from search',
      );
    } catch (e) {
      onChange(before);
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  // Which quick option matches the saved back-on date (-1 = none of them).
  const selectedDays =
    l.available_again_on == null
      ? 0
      : (BACK_ON_OPTIONS.find((o) => o.value > 0 && colomboDate(o.value) === l.available_again_on)?.value ?? -1);

  // Switching off: first ask who rented it (from people who contacted the
  // owner recently), which lets that customer leave a verified review.
  const switchOff = async () => {
    try {
      const contacts = await getRecentContacts(l.id);
      if (contacts.length) {
        setRenters(contacts);
        return;
      }
    } catch {
      // Not essential; go straight to the date.
    }
    setPickingDate(true);
  };

  const pickRenter = async (userId: string) => {
    const renter = renters?.find((r) => r.user_id === userId);
    if (renter) {
      try {
        await confirmHire(l.id, renter.user_id);
        toast(`Thanks! ${renter.name} can now leave a verified review.`);
      } catch (e) {
        toast(friendlyError(e), 'error');
      }
    }
    // Let this sheet slide away before the next one opens.
    setTimeout(() => setPickingDate(true), 350);
  };

  const status = l.is_hidden ? (
    <Tag label={l.hidden_reason === 'reports' ? 'Under review' : 'Hidden by RentAnything'} icon={EyeOff} />
  ) : on ? (
    <Tag label="Showing in search" icon={Check} tone="success" />
  ) : (
    <Tag label="Hidden from search" icon={EyeOff} />
  );

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Preview ${l.title}`}
        onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: l.id } })}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
        <VehiclePhoto path={l.listing_photos[0]?.path} seed={l.id} style={styles.thumb} iconSize={26} fit="cover" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {l.title}
          </Text>
          {v ? (
            <Text style={styles.sub}>
              {formatLKR(v.price_per_day)}/day · {v.seats} seats · {l.town}
            </Text>
          ) : null}
          {status}
        </View>
      </Pressable>
      <Divider />
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.toggleTitle}>Available for rent</Text>
          <Text style={styles.small}>
            {l.is_hidden
              ? "Hidden by RentAnything — customers can't see it right now"
              : on
                ? 'Customers can see and call you'
                : "Switched off — you won't get calls"}
          </Text>
        </View>
        <Toggle
          value={on}
          onChange={(next) => (next ? save(true, null) : switchOff())}
          disabled={saving}
          label="Available for rent"
        />
      </View>

      {!on ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change back-on date"
          onPress={() => setPickingDate(true)}
          style={({ pressed }) => [styles.backOn, pressed && { opacity: 0.8 }]}>
          <Calendar size={18} color={colors.text2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.backOnLabel}>Back on automatically</Text>
            <Text style={styles.backOnDate}>
              {l.available_again_on ? formatDateShort(l.available_again_on) : 'Not set — switch on yourself'}
            </Text>
          </View>
          <Text style={styles.change}>Change</Text>
        </Pressable>
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

      {l.is_hidden ? (
        <View style={styles.hiddenBox}>
          <Text style={styles.small}>
            {l.hidden_reason === 'reports'
              ? 'Customers reported this listing, so it is hidden while we check it.'
              : 'RentAnything hid this listing.'}{' '}
            Contact us if you think this is a mistake.
          </Text>
          {hasSupport ? (
            <Button
              label="Contact support"
              kind="whatsapp"
              size="sm"
              icon={MessageCircle}
              onPress={() => contactSupport(`Hi RentAnything, my listing "${l.title}" was hidden. Can you help?`)}
            />
          ) : null}
        </View>
      ) : null}

      <OptionSheet
        visible={renters != null}
        title="Who rented it?"
        options={[
          ...(renters ?? []).map((r) => ({
            value: r.user_id,
            label: r.name,
            description: `Contacted you ${formatDateShort(r.last_contacted_at.slice(0, 10))}${r.confirmed ? ' · already confirmed' : ''}`,
          })),
          { value: 'none', label: 'Someone else / not sure', description: 'Skip this step' },
        ]}
        value=""
        onSelect={pickRenter}
        onClose={() => setRenters(null)}
      />

      <OptionSheet
        visible={pickingDate}
        title="When will it be available again?"
        options={BACK_ON_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.value > 0 ? formatDateShort(colomboDate(o.value)) : 'Switch it back on yourself',
        }))}
        value={on ? -2 : selectedDays}
        onSelect={(days) => save(false, days > 0 ? colomboDate(days) : null)}
        onClose={() => setPickingDate(false)}
      />
    </View>
  );
}

function OwnerCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton style={styles.thumb} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton style={{ height: 16, width: '75%' }} />
          <Skeleton style={{ height: 12, width: '50%' }} />
          <Skeleton style={{ height: 22, width: 120 }} />
        </View>
      </View>
      <Skeleton style={{ height: 40 }} />
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
  backOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  backOnLabel: { fontSize: 12, color: colors.text2 },
  backOnDate: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  change: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  hiddenBox: { gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: '#FEF2F2' },
});
