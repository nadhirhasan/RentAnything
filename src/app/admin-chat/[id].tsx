import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen } from '@/components/layout';
import { Button, Notice, RoundIconButton, Skeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { adminReadConversation, resolveChatReports, type AdminChatLine } from '@/lib/chat';
import { formatChatDay, formatChatTime } from '@/lib/chat-rules';
import { friendlyError } from '@/lib/supabase';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Read-only transcript for admins (reported or disputed chats only; the
// database refuses others and logs every read).
export default function AdminChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [loaded, setLoaded] = useState<{ id: string; lines: AdminChatLine[] | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.is_admin) return;
    let cancelled = false;
    adminReadConversation(id).then(
      (lines) => !cancelled && setLoaded({ id, lines, error: null }),
      (e) => !cancelled && setLoaded({ id, lines: null, error: friendlyError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, profile?.is_admin]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

  if (!profile?.is_admin) {
    return (
      <Screen>
        <EmptyState icon={ShieldCheck} title="Admins only" text="This page is for RentAnything moderators." />
      </Screen>
    );
  }

  const act = async (action: 'dismiss' | 'block') => {
    if (
      action === 'block' &&
      !(await confirm({
        title: 'Block this chat?',
        message: 'Neither side can send more messages in it.',
        confirmLabel: 'Block',
        destructive: true,
      }))
    )
      return;
    setBusy(action);
    try {
      await resolveChatReports(id, action);
      toast(action === 'block' ? 'Chat blocked' : 'Reports dismissed');
      goBack();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const lines = loaded?.id === id ? loaded.lines : null;
  const error = loaded?.id === id ? loaded.error : null;

  return (
    <Screen>
      <View style={styles.header}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={goBack} background="transparent" size={40} />
        <Text style={styles.heading}>Chat review</Text>
      </View>
      {error ? (
        <EmptyState icon={ShieldCheck} title="Can't open this chat" text={error} />
      ) : !lines ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton style={{ height: 40, width: '70%', borderRadius: radius.lg }} />
          <Skeleton style={{ height: 40, width: '60%', alignSelf: 'flex-end', borderRadius: radius.lg }} />
        </View>
      ) : (
        <>
          <FlatList
            data={lines}
            keyExtractor={(l) => String(l.id)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Notice text="Opening this chat was logged. Customer on the left, owner on the right." />}
            renderItem={({ item, index }) => {
              const prev = lines[index - 1];
              const showDay = !prev || formatChatDay(prev.created_at) !== formatChatDay(item.created_at);
              return (
                <View>
                  {showDay ? <Text style={styles.day}>{formatChatDay(item.created_at)}</Text> : null}
                  {item.sender === 'system' ? (
                    <Text style={styles.system}>{item.body}</Text>
                  ) : (
                    <View style={{ alignItems: item.sender === 'owner' ? 'flex-end' : 'flex-start', gap: 2 }}>
                      <Text style={styles.who}>
                        {item.sender === 'owner' ? 'Owner' : 'Customer'} · {formatChatTime(item.created_at)}
                        {item.masked ? ' · contact details hidden' : ''}
                      </Text>
                      <View style={[styles.bubble, item.sender === 'owner' ? styles.owner : styles.customer]}>
                        <Text style={styles.text} selectable>
                          {item.body}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
          />
          <View style={styles.actions}>
            <Button
              label="Dismiss reports"
              kind="ghost"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'dismiss'}
              onPress={() => act('dismiss')}
            />
            <Button
              label="Block chat"
              kind="danger"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'block'}
              onPress={() => act('block')}
            />
          </View>
        </>
      )}
    </Screen>
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
  list: { padding: 16, gap: 8, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  day: { alignSelf: 'center', fontSize: 12, color: colors.muted, marginVertical: 6 },
  system: { alignSelf: 'center', fontSize: 12, color: colors.text2, textAlign: 'center' },
  who: { fontSize: 11, color: colors.muted },
  bubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  owner: { backgroundColor: colors.primary100 },
  customer: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  text: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
