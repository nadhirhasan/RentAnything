import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, EyeOff, MessageCircle, ShieldCheck, Star } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen } from '@/components/layout';
import { Button, RoundIconButton, Segmented, Skeleton, Tag } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { formatDateShort, whatsappUrl } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import {
  getHiddenListings,
  getReportQueue,
  moderateListing,
  moderateReview,
  reasonLabel,
  type HiddenListing,
  type QueueItem,
  type QueueReport,
} from '@/lib/trust';
import { colors, font, radius } from '@/theme';

type Tab = 'reports' | 'hidden';

// Admin-only moderation: open reports and hidden listings.
export default function AdminScreen() {
  const { profile, loading } = useAuth();
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<Tab>('reports');
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [hidden, setHidden] = useState<HiddenListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.is_admin) return;
    try {
      const [q, h] = await Promise.all([getReportQueue(), getHiddenListings()]);
      setQueue(q);
      setHidden(h);
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [profile?.is_admin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  if (loading) return null;
  if (!profile?.is_admin) {
    return (
      <Screen>
        <EmptyState icon={ShieldCheck} title="Admins only" text="This page is for RentAnything moderators." />
      </Screen>
    );
  }

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

  const listingActions = (item: { listing_id: string; is_hidden: boolean; title: string }, hasReports: boolean) => (
    <View style={styles.actions}>
      <Button
        label="View"
        kind="ghost"
        size="sm"
        style={styles.action}
        onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: item.listing_id } })}
      />
      {item.is_hidden ? (
        <Button
          label="Unhide"
          kind="soft"
          size="sm"
          style={styles.action}
          loading={busy === `unhide-${item.listing_id}`}
          onPress={() => act(`unhide-${item.listing_id}`, () => moderateListing(item.listing_id, 'unhide'), 'Listing is visible again')}
        />
      ) : (
        <Button
          label="Hide"
          kind="danger"
          size="sm"
          style={styles.action}
          loading={busy === `hide-${item.listing_id}`}
          onPress={() =>
            act(`hide-${item.listing_id}`, () => moderateListing(item.listing_id, 'hide'), 'Listing hidden', {
              title: 'Hide this listing?',
              message: `"${item.title}" will be removed from search until you unhide it.`,
              confirmLabel: 'Hide',
              destructive: true,
            })
          }
        />
      )}
      {hasReports ? (
        <Button
          label="Dismiss"
          kind="ghost"
          size="sm"
          style={styles.action}
          loading={busy === `dismiss-${item.listing_id}`}
          onPress={() =>
            act(`dismiss-${item.listing_id}`, () => moderateListing(item.listing_id, 'dismiss'), 'Reports dismissed')
          }
        />
      ) : null}
    </View>
  );

  const ownerRow = (name: string, phone: string | null, title: string) => (
    <View style={styles.ownerRow}>
      <Text style={styles.sub} numberOfLines={2}>
        Owner: {name || 'Unknown'}
        {phone ? `\n${phone}` : ''}
      </Text>
      {phone ? (
        <Button
          label="WhatsApp"
          kind="whatsapp"
          size="sm"
          icon={MessageCircle}
          onPress={() =>
            Linking.openURL(whatsappUrl(phone, `Hi ${name}, this is RentAnything support about your listing "${title}".`))
          }
        />
      ) : null}
    </View>
  );

  const renderQueueItem = ({ item }: { item: QueueItem }) => {
    const listingReports = item.reports.filter((r) => r.review_id == null);
    const byReview = new Map<number, QueueReport[]>();
    for (const r of item.reports) {
      if (r.review_id != null) byReview.set(r.review_id, [...(byReview.get(r.review_id) ?? []), r]);
    }
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <VehiclePhoto path={item.cover_photo} seed={item.listing_id} style={styles.thumb} fit="cover" iconSize={24} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.sub}>{item.town}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Tag label={`${item.open_count} open report${item.open_count === 1 ? '' : 's'}`} tone="offer" />
              {item.is_hidden ? (
                <Tag label={item.hidden_reason === 'reports' ? 'Auto-hidden' : 'Hidden'} icon={EyeOff} />
              ) : null}
            </View>
          </View>
        </View>
        {ownerRow(item.owner_name, item.owner_phone, item.title)}

        {listingReports.length ? (
          <View style={styles.reports}>
            <Text style={styles.label}>Listing reports</Text>
            {listingReports.map((r) => (
              <ReportLine key={r.id} r={r} />
            ))}
            {listingActions(item, true)}
          </View>
        ) : null}

        {[...byReview.entries()].map(([reviewId, reports]) => (
          <View key={reviewId} style={styles.reports}>
            <Text style={styles.label}>Reported review</Text>
            <View style={styles.quote}>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {Array.from({ length: reports[0].review_rating ?? 0 }).map((_, i) => (
                  <Star key={i} size={14} color="#F59E0B" fill="#F59E0B" />
                ))}
              </View>
              <Text style={styles.quoteText}>{reports[0].review_comment || '(no comment)'}</Text>
              {reports[0].review_hidden ? <Tag label="Review hidden" icon={EyeOff} /> : null}
            </View>
            {reports.map((r) => (
              <ReportLine key={r.id} r={r} />
            ))}
            <View style={styles.actions}>
              <Button
                label="Hide review"
                kind="danger"
                size="sm"
                style={styles.action}
                loading={busy === `rh-${reviewId}`}
                onPress={() => act(`rh-${reviewId}`, () => moderateReview(reviewId, 'hide'), 'Review hidden')}
              />
              <Button
                label="Keep review"
                kind="ghost"
                size="sm"
                style={styles.action}
                loading={busy === `rd-${reviewId}`}
                onPress={() => act(`rd-${reviewId}`, () => moderateReview(reviewId, 'dismiss'), 'Reports dismissed')}
              />
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderHidden = ({ item }: { item: HiddenListing }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <VehiclePhoto path={item.cover_photo} seed={item.listing_id} style={styles.thumb} fit="cover" iconSize={24} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.sub}>
            {item.hidden_reason === 'reports' ? 'Auto-hidden after reports' : 'Hidden by admin'}
            {item.hidden_at ? ` · ${formatDateShort(item.hidden_at.slice(0, 10))}` : ''}
          </Text>
        </View>
      </View>
      {ownerRow(item.owner_name, item.owner_phone, item.title)}
      {listingActions({ ...item, is_hidden: true }, false)}
    </View>
  );

  const loadingView = (
    <View style={{ padding: 16, gap: 12 }}>
      <Skeleton style={{ height: 180, borderRadius: radius.lg }} />
      <Skeleton style={{ height: 180, borderRadius: radius.lg }} />
    </View>
  );

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
    />
  );

  return (
    <Screen>
      <View style={styles.header}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={goBack} background="transparent" size={40} />
        <Text style={styles.heading}>Moderation</Text>
      </View>
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'reports', label: `Reports${queue ? ` (${queue.length})` : ''}` },
            { value: 'hidden', label: `Hidden${hidden ? ` (${hidden.length})` : ''}` },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </View>
      {error ? (
        <EmptyState icon={ShieldCheck} title="Couldn't load" text={error} action={<Button label="Try again" onPress={load} />} />
      ) : tab === 'reports' ? (
        queue == null ? (
          loadingView
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(q) => q.listing_id}
            renderItem={renderQueueItem}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            refreshControl={refresh}
            ListEmptyComponent={
              <EmptyState icon={ShieldCheck} title="All clear" text="No open reports right now." />
            }
          />
        )
      ) : hidden == null ? (
        loadingView
      ) : (
        <FlatList
          data={hidden}
          keyExtractor={(h) => h.listing_id}
          renderItem={renderHidden}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={refresh}
          ListEmptyComponent={<EmptyState icon={EyeOff} title="Nothing hidden" text="No listings are hidden." />}
        />
      )}
    </Screen>
  );
}

function ReportLine({ r }: { r: QueueReport }) {
  return (
    <View style={styles.reportLine}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={styles.reason}>{reasonLabel(r.reason)}</Text>
        <Text style={styles.date}>{formatDateShort(r.created_at.slice(0, 10))}</Text>
      </View>
      {r.note ? <Text style={styles.note}>&ldquo;{r.note}&rdquo;</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  heading: { fontSize: 20, fontWeight: font.bold, color: colors.ink },
  tabs: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.white },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, flexShrink: 1 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reports: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  label: { fontSize: 12, fontWeight: font.semibold, color: colors.muted, textTransform: 'uppercase' },
  reportLine: { gap: 2, padding: 10, borderRadius: radius.md, backgroundColor: colors.background },
  reason: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  date: { fontSize: 12, color: colors.muted },
  note: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  quote: { gap: 4, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.border },
  quoteText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
