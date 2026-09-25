import { router, useFocusEffect } from 'expo-router';
import { Bell, MessageCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { StatePill } from '@/components/booking';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { Button, Skeleton } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { getConversations, type ConversationSummary } from '@/lib/chat';
import { formatChatTime } from '@/lib/chat-rules';
import { useMessages } from '@/lib/messages';
import { askForNotifications, notificationsAllowed, pushSupported } from '@/lib/push';
import { friendlyError } from '@/lib/supabase';
import { colors, font, radius } from '@/theme';

export default function MessagesScreen() {
  const { session } = useAuth();
  const { subscribe } = useMessages();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pushOff, setPushOff] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await getConversations());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (pushSupported) notificationsAllowed().then((ok) => setPushOff(!ok));
    }, [load]),
  );

  // Keep the list fresh while it's open.
  useEffect(() => subscribe(() => load()), [subscribe, load]);

  if (!session) {
    return (
      <Screen>
        <Header />
        <SignInPrompt
          title="Your messages"
          text="Sign in to chat with owners about their vehicles, or with customers about yours."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      {items == null ? (
        error ? (
          <EmptyState
            icon={MessageCircle}
            title="Couldn't load your messages"
            text={error}
            action={<Button label="Try again" onPress={load} />}
          />
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton style={{ height: 72, borderRadius: radius.lg }} />
            <Skeleton style={{ height: 72, borderRadius: radius.lg }} />
          </View>
        )
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
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
            pushOff ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => askForNotifications().then((ok) => setPushOff(!ok))}
                style={styles.push}>
                <Bell size={20} color={colors.primary} />
                <Text style={styles.pushText}>Turn on notifications so you don&apos;t miss replies and bookings.</Text>
                <Text style={styles.pushLink}>Turn on</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              text="Open any vehicle and tap Message to ask the owner about it."
              action={<Button label="Find a vehicle" onPress={() => router.navigate('/')} />}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => <Row c={item} />}
        />
      )}
    </Screen>
  );
}

function Row({ c }: { c: ConversationSummary }) {
  const unread = c.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${c.other_name} about ${c.title}${unread ? `, ${c.unread} unread` : ''}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}>
      <View>
        <Avatar name={c.other_name} path={c.other_avatar} size={56} />
        <VehiclePhoto path={c.cover_photo} seed={c.listing_id} style={styles.vehicleBadge} fit="cover" iconSize={10} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.line}>
          <Text style={[styles.name, unread && { fontWeight: font.bold }]} numberOfLines={1}>
            {c.other_name}
          </Text>
          <Text style={[styles.time, unread && { color: colors.primary }]}>{formatChatTime(c.last_message_at)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {c.role === 'owner' ? 'Your ' : ''}
          {c.title}
        </Text>
        <View style={styles.line}>
          <Text style={[styles.preview, unread && { color: colors.ink, fontWeight: font.medium }]} numberOfLines={1}>
            {c.blocked ? 'Blocked · ' : ''}
            {c.last_is_mine ? 'You: ' : ''}
            {c.last_message}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{c.unread > 9 ? '9+' : c.unread}</Text>
            </View>
          ) : c.booking_state && ['requested', 'accepted', 'started'].includes(c.booking_state) ? (
            <StatePill state={c.booking_state} role={c.role} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.heading}>Messages</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, backgroundColor: colors.white },
  heading: { fontSize: 24, fontWeight: font.bold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.white },
  vehicleBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.white,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  time: { fontSize: 12, color: colors.muted },
  title: { fontSize: 13, color: colors.text2 },
  preview: { flex: 1, fontSize: 14, color: colors.text2 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: font.bold, color: colors.white },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 84 },
  push: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary50,
  },
  pushText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  pushLink: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
});
