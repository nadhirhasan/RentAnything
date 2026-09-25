// Admin tab: chats that were reported or belong to a booking dispute. Only
// these can be opened (docs/SPEC.md §13).
import { router, useFocusEffect } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/layout';
import { Button, Notice, Skeleton, Tag } from '@/components/ui';
import { getChatQueue, type ChatQueueItem } from '@/lib/chat';
import { formatDateShort } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { reasonLabel } from '@/lib/trust';
import { colors, font, radius } from '@/theme';

export function ChatsTab() {
  const [items, setItems] = useState<ChatQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await getChatQueue());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (error) {
    return <EmptyState icon={MessagesSquare} title="Couldn't load" text={error} action={<Button label="Try again" onPress={load} />} />;
  }
  if (!items) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton style={{ height: 120, borderRadius: radius.lg }} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.conversation_id}
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
        <Notice text="Only reported chats and chats in a booking dispute are listed. Every time you open one, it is logged." />
      }
      ListEmptyComponent={<EmptyState icon={MessagesSquare} title="Nothing to check" text="No reported or disputed chats." />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ gap: 2 }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>
              Owner: {item.owner_name || 'Unknown'} · Customer: {item.customer_name || 'Unknown'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {item.open_reports ? (
              <Tag label={`${item.open_reports} report${item.open_reports === 1 ? '' : 's'}`} tone="offer" />
            ) : null}
            {item.dispute ? <Tag label="Booking dispute" tone="primary" /> : null}
          </View>
          {item.reports.map((r, i) => (
            <View key={i} style={styles.report}>
              <Text style={styles.reason}>
                {reasonLabel(r.reason)} · by the {r.by} · {formatDateShort(r.created_at.slice(0, 10))}
              </Text>
              {r.note ? <Text style={styles.sub}>&ldquo;{r.note}&rdquo;</Text> : null}
            </View>
          ))}
          <Button
            label="Read chat"
            kind="soft"
            size="sm"
            onPress={() => router.push({ pathname: '/admin-chat/[id]', params: { id: item.conversation_id } })}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  report: { gap: 2, padding: 10, borderRadius: radius.md, backgroundColor: colors.background },
  reason: { fontSize: 13, fontWeight: font.semibold, color: colors.ink },
});
