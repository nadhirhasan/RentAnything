// Admin tabs for the money side (docs/SPEC.md §12): payments owners
// reported, owners' balances, disputes and settings.
import { router, useFocusEffect } from 'expo-router';
import { CircleAlert, MessageCircle, Scale, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState } from '@/components/layout';
import { Button, Field, Notice, Segmented, Skeleton, Tag } from '@/components/ui';
import { formatDays, formatRange, lastDay, reasonLabel } from '@/lib/booking-rules';
import {
  adjustDues,
  getAppSettings,
  getDisputes,
  getDuesOverview,
  PAYMENT_METHODS,
  resolveDispute,
  reviewPayment,
  updateSettings,
  type AppSettings,
  type DisputeRow,
  type OwnerDuesRow,
} from '@/lib/bookings';
import { formatAmountInput, formatDateShort, formatLKR, parseAmount, whatsappUrl } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { colors, font, radius } from '@/theme';

// Loads a list when the tab is shown; pull to refresh.
function useAdminList<T>(fetch: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(await fetch());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [fetch]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
    />
  );
  return { items, error, load, refreshControl };
}

function useAct(load: () => Promise<void>) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, run: () => Promise<void>, message: string, ask?: Parameters<typeof confirm>[0]) => {
    if (ask && !(await confirm(ask))) return;
    setBusy(key);
    try {
      await run();
      toast(message);
      await load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return { busy, act };
}

const loadingView = (
  <View style={{ padding: 16, gap: 12 }}>
    <Skeleton style={{ height: 150, borderRadius: radius.lg }} />
    <Skeleton style={{ height: 150, borderRadius: radius.lg }} />
  </View>
);

function WhatsAppButton({ phone, message }: { phone: string | null; message: string }) {
  if (!phone) return null;
  return (
    <Button
      label="WhatsApp"
      kind="whatsapp"
      size="sm"
      icon={MessageCircle}
      onPress={() => Linking.openURL(whatsappUrl(phone, message)).catch(() => {})}
    />
  );
}

// ---------------------------------------------------------------------------
// Payments & balances
// ---------------------------------------------------------------------------

export function PaymentsTab() {
  const { items, error, load, refreshControl } = useAdminList(getDuesOverview);
  const { busy, act } = useAct(load);

  if (error) return <EmptyState icon={Wallet} title="Couldn't load" text={error} action={<Button label="Try again" onPress={load} />} />;
  if (!items) return loadingView;

  return (
    <FlatList
      data={items}
      keyExtractor={(o) => o.owner_id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={refreshControl}
      ListEmptyComponent={<EmptyState icon={Wallet} title="Nothing owed" text="No owner owes anything right now." />}
      renderItem={({ item }) => <OwnerDuesCard o={item} busy={busy} act={act} />}
    />
  );
}

function OwnerDuesCard({
  o,
  busy,
  act,
}: {
  o: OwnerDuesRow;
  busy: string | null;
  act: ReturnType<typeof useAct>['act'];
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [direction, setDirection] = useState<'waive' | 'charge'>('waive');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const p = o.pending_payment;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{o.owner_name || 'Owner'}</Text>
          {o.owner_phone ? <Text style={styles.sub}>{o.owner_phone}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[styles.amount, o.restricted && { color: colors.danger }]}>{formatLKR(o.balance)}</Text>
          {o.restricted ? (
            <Tag label={o.restricted_reason === 'limit' ? 'Over limit' : 'Overdue'} tone="offer" />
          ) : null}
        </View>
      </View>
      {o.oldest_unpaid_at && o.balance > 0 ? (
        <Text style={styles.sub}>Oldest unpaid fee: {formatDateShort(o.oldest_unpaid_at.slice(0, 10))}</Text>
      ) : null}

      {p ? (
        <View style={styles.box}>
          <Text style={styles.label}>Payment to check</Text>
          <Text style={styles.body}>
            {formatLKR(p.amount)} · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label} ·{' '}
            {formatDateShort(p.created_at.slice(0, 10))}
          </Text>
          {p.reference ? <Text style={styles.sub}>Reference: {p.reference}</Text> : null}
          <View style={styles.actions}>
            <Button
              label="Received"
              size="sm"
              style={styles.action}
              loading={busy === `ok-${p.id}`}
              onPress={() => act(`ok-${p.id}`, () => reviewPayment(p.id, true), 'Payment approved')}
            />
            <Button
              label="Not received"
              kind="danger"
              size="sm"
              style={styles.action}
              loading={busy === `no-${p.id}`}
              onPress={() =>
                act(
                  `no-${p.id}`,
                  () => reviewPayment(p.id, false, "We couldn't find this payment. Please contact support."),
                  'Payment rejected',
                  {
                    title: 'Reject this payment?',
                    message: 'The owner will see it as not received.',
                    confirmLabel: 'Reject',
                    destructive: true,
                  },
                )
              }
            />
          </View>
        </View>
      ) : null}

      {adjusting ? (
        <View style={styles.box}>
          <Segmented
            options={[
              { value: 'waive', label: 'Reduce balance' },
              { value: 'charge', label: 'Add a charge' },
            ]}
            value={direction}
            onChange={setDirection}
          />
          <Field
            label="Amount"
            prefix="Rs"
            value={amount}
            onChangeText={(t) => setAmount(formatAmountInput(t))}
            keyboardType="number-pad"
          />
          <Field label="Note (the owner sees it)" value={note} onChangeText={setNote} maxLength={300} />
          <View style={styles.actions}>
            <Button label="Cancel" kind="ghost" size="sm" style={styles.action} onPress={() => setAdjusting(false)} />
            <Button
              label="Save"
              size="sm"
              style={styles.action}
              loading={busy === `adj-${o.owner_id}`}
              onPress={() => {
                const n = parseAmount(amount);
                if (!n || !note.trim()) return;
                act(
                  `adj-${o.owner_id}`,
                  async () => {
                    await adjustDues(o.owner_id, direction === 'waive' ? -n : n, note);
                    setAdjusting(false);
                    setAmount('');
                    setNote('');
                  },
                  'Balance updated',
                );
              }}
            />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <WhatsAppButton
            phone={o.owner_phone}
            message={`Hi ${o.owner_name}, this is RentAnything about your balance of ${formatLKR(o.balance)}.`}
          />
          <Button label="Adjust" kind="ghost" size="sm" style={styles.action} onPress={() => setAdjusting(true)} />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export function DisputesTab() {
  const { items, error, load, refreshControl } = useAdminList(getDisputes);
  const { busy, act } = useAct(load);

  if (error) return <EmptyState icon={Scale} title="Couldn't load" text={error} action={<Button label="Try again" onPress={load} />} />;
  if (!items) return loadingView;

  return (
    <FlatList
      data={items}
      keyExtractor={(d) => d.booking_id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={refreshControl}
      ListHeaderComponent={
        <Notice text="The customer says they rented the vehicle, but the owner never entered the handover code. Check with both, then charge the fee or dismiss." />
      }
      ListEmptyComponent={<EmptyState icon={Scale} title="No disputes" text="Nothing to check right now." />}
      renderItem={({ item }) => <DisputeCard d={item} busy={busy} act={act} />}
    />
  );
}

function DisputeCard({ d, busy, act }: { d: DisputeRow; busy: string | null; act: ReturnType<typeof useAct>['act'] }) {
  const fee = Math.round((d.estimate * d.commission_percent) / 100);
  const range = formatRange(d.start_date, lastDay(d.start_date, d.days));
  return (
    <View style={styles.card}>
      <View style={{ gap: 2 }}>
        <Text style={styles.title}>{d.title}</Text>
        <Text style={styles.sub}>
          {range} · {formatDays(d.days)} · listed price {formatLKR(d.estimate)}
        </Text>
        <Text style={styles.sub}>
          Booking status: {d.status.replace('_', ' ')}
          {d.close_reason ? ` · ${reasonLabel(d.close_reason) ?? d.close_reason}` : ''}
          {d.closed_by ? ` (by ${d.closed_by})` : ''}
        </Text>
      </View>
      <View style={styles.rowBetween}>
        <Text style={[styles.sub, { flex: 1 }]}>
          Owner: {d.owner_name}
          {d.owner_phone ? `\n${d.owner_phone}` : ''}
        </Text>
        <WhatsAppButton phone={d.owner_phone} message={`Hi ${d.owner_name}, this is RentAnything about the booking of your ${d.title} (${range}).`} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={[styles.sub, { flex: 1 }]}>
          Customer: {d.customer_name}
          {d.customer_phone ? `\n${d.customer_phone}` : ''}
        </Text>
        <WhatsAppButton phone={d.customer_phone} message={`Hi ${d.customer_name}, this is RentAnything about your booking of the ${d.title} (${range}).`} />
      </View>
      <View style={styles.actions}>
        <Button
          label="View vehicle"
          kind="ghost"
          size="sm"
          style={styles.action}
          onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: d.listing_id } })}
        />
      </View>
      <View style={styles.actions}>
        <Button
          label={`Charge ${formatLKR(fee)}`}
          size="sm"
          style={styles.action}
          loading={busy === `charge-${d.booking_id}`}
          onPress={() =>
            act(`charge-${d.booking_id}`, () => resolveDispute(d.booking_id, true), 'Fee added to the owner’s balance', {
              title: 'Charge the fee?',
              message: `${formatLKR(fee)} (${d.commission_percent}% of the listed price) will be added to ${d.owner_name}'s balance.`,
              confirmLabel: 'Charge',
            })
          }
        />
        <Button
          label="Dismiss"
          kind="ghost"
          size="sm"
          style={styles.action}
          loading={busy === `dismiss-${d.booking_id}`}
          onPress={() => act(`dismiss-${d.booking_id}`, () => resolveDispute(d.booking_id, false), 'Dispute dismissed')}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      getAppSettings().then(setSettings, (e) => setError(friendlyError(e)));
    }, []),
  );
  if (error) return <EmptyState icon={CircleAlert} title="Couldn't load" text={error} />;
  if (!settings) return loadingView;
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} />;
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const { toast } = useFeedback();
  const [percent, setPercent] = useState(String(initial.commission_percent));
  const [limit, setLimit] = useState(formatAmountInput(String(initial.dues_limit)));
  const [days, setDays] = useState(String(initial.dues_days));
  const [details, setDetails] = useState(initial.payment_details);
  const [free, setFree] = useState(String(initial.free_rentals));
  const [cap, setCap] = useState(formatAmountInput(String(initial.fee_cap)));
  const [coin, setCoin] = useState(String(initial.coin_value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const p = Number(percent.replace(',', '.'));
    const l = parseAmount(limit);
    const d = Number(days);
    if (!Number.isFinite(p) || p < 0 || p > 30) return setError('Fee must be between 0 and 30%.');
    if (l == null) return setError('Enter the balance limit.');
    if (!Number.isInteger(d) || d < 1 || d > 365) return setError('Days must be between 1 and 365.');
    const f = Number(free);
    const c = parseAmount(cap) ?? 0;
    const v = Number(coin);
    if (!Number.isInteger(f) || f < 0 || f > 50) return setError('Free rentals must be between 0 and 50.');
    if (!Number.isInteger(v) || v < 1 || v > 1000) return setError('A coin must be worth Rs 1 to 1,000.');
    setBusy(true);
    setError(null);
    try {
      await updateSettings({
        commission_percent: p,
        dues_limit: l,
        dues_days: d,
        payment_details: details,
        free_rentals: f,
        fee_cap: c,
        coin_value: v,
      });
      toast('Settings saved');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field
            label="RentAnything fee"
            suffix="%"
            value={percent}
            onChangeText={setPercent}
            keyboardType="decimal-pad"
            hint="Of the agreed price, added to the owner's balance when a rental starts. Changes apply to new requests."
          />
          <Field
            label="Free rentals for new owners"
            value={free}
            onChangeText={(t) => setFree(t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            hint="An owner's first rentals started with the code have no fee."
          />
          <Field
            label="Highest fee per rental"
            prefix="Rs"
            value={cap}
            onChangeText={(t) => setCap(formatAmountInput(t))}
            keyboardType="number-pad"
            hint="Use 0 for no limit. Keeps long, expensive rentals worth recording."
          />
          <Field
            label="1 coin is worth"
            prefix="Rs"
            value={coin}
            onChangeText={(t) => setCoin(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            hint="Owners see fees and balances in coins. Fees are rounded to whole coins."
          />
          <Field
            label="Hide vehicles when an owner owes"
            prefix="Rs"
            value={limit}
            onChangeText={(t) => setLimit(formatAmountInput(t))}
            keyboardType="number-pad"
            hint="or more. Use 0 to require payment before any new booking."
          />
          <Field
            label="…or when a fee is unpaid for"
            suffix="days"
            value={days}
            onChangeText={(t) => setDays(t.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
          />
          <Field
            label="How owners pay you"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
            placeholder={'Bank: …\nAccount name: …\nAccount number: …\neZ Cash: 07X XXX XXXX'}
            hint="Shown on the owners' payments page."
          />
          {error ? <Notice icon={CircleAlert} tone="danger" text={error} /> : null}
          <Button label="Save settings" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  body: { fontSize: 14, color: colors.ink },
  amount: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
  label: { fontSize: 12, fontWeight: font.semibold, color: colors.muted, textTransform: 'uppercase' },
  box: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.background },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
