import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Ban,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Lock,
  MessageCircle,
  Phone,
  SendHorizontal,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { StatePill } from '@/components/booking';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { ReportSheet } from '@/components/report-sheet';
import { OptionSheet } from '@/components/sheet';
import { Button, InfoTip, RoundIconButton, Skeleton, webNoOutline } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CHAT_REPORT_REASONS,
  getConversation,
  getMessages,
  markRead,
  PAGE,
  reportConversation,
  sendMessage,
  setBlocked,
  type ChatMessage,
  type Conversation,
} from '@/lib/chat';
import { HELP } from '@/lib/help';
import { formatChatDay, formatChatTime, looksLikeContact, mergeMessages, sameChatDay } from '@/lib/chat-rules';
import { formatLKR, telUrl, whatsappUrl } from '@/lib/format';
import { useMessages } from '@/lib/messages';
import { askForNotifications } from '@/lib/push';
import { friendlyError } from '@/lib/supabase';
import { colors, font, maxContentWidth, radius } from '@/theme';

const ACTIVE_BOOKING = ['requested', 'accepted', 'started'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const { toast } = useFeedback();
  const { subscribe, refreshUnread } = useMessages();

  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const askedForPush = useRef(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [c, m] = await Promise.all([getConversation(id), getMessages(id)]);
      setConv(c);
      setMessages((prev) => mergeMessages(prev?.filter((x) => !x.pending) ?? [], m));
      setOlderDone(m.length < PAGE);
      setError(null);
      markRead(id).then(refreshUnread);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [id, session, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // New messages while the chat is open.
  useEffect(
    () =>
      subscribe((m) => {
        if (m.conversation_id !== id) return;
        setMessages((prev) => mergeMessages(prev ?? [], [m]));
        if (m.sender_id !== me) {
          markRead(id).then(refreshUnread);
          // Booking updates change the header (phone numbers, status).
          if (m.kind === 'system') getConversation(id).then(setConv, () => {});
        }
      }),
    [subscribe, id, me, refreshUnread],
  );

  const loadOlder = async () => {
    if (!messages?.length || olderDone || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await getMessages(id, messages[messages.length - 1].id);
      setMessages((prev) => mergeMessages(prev ?? [], older));
      setOlderDone(older.length < PAGE);
    } catch {
      // Try again on the next scroll.
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !me) return;
    const tempId = -Date.now();
    const temp: ChatMessage = {
      id: tempId,
      conversation_id: id,
      sender_id: me,
      kind: 'text',
      body: text,
      masked: false,
      booking_id: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setDraft('');
    setMessages((prev) => [temp, ...(prev ?? [])]);
    try {
      const r = await sendMessage(id, text);
      setMessages((prev) =>
        mergeMessages(
          (prev ?? []).filter((m) => m.id !== tempId),
          [
            {
              ...temp,
              id: r.id,
              body: r.body,
              masked: r.masked,
              pending: false,
            },
          ],
        ),
      );
      if (!askedForPush.current) {
        askedForPush.current = true;
        askForNotifications();
      }
    } catch (e) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setDraft(text);
      toast(friendlyError(e), 'error');
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/messages'));

  if (!session) {
    return (
      <Screen>
        <SignInPrompt title="Sign in to see your messages" text="Chats are only shown to the customer and the owner." />
      </Screen>
    );
  }

  if (!conv || !messages) {
    return (
      <Screen background={colors.white}>
        <View style={styles.header}>
          <RoundIconButton icon={ChevronLeft} label="Back" onPress={goBack} background="transparent" size={40} />
        </View>
        {error ? (
          <EmptyState
            icon={MessageCircle}
            title="Chat not found"
            text={error}
            action={<Button label="Try again" onPress={load} />}
          />
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton style={{ height: 56, borderRadius: radius.lg }} />
            <Skeleton style={{ height: 40, width: '60%', borderRadius: radius.lg }} />
            <Skeleton
              style={{
                height: 40,
                width: '50%',
                alignSelf: 'flex-end',
                borderRadius: radius.lg,
              }}
            />
          </View>
        )}
      </Screen>
    );
  }

  const owner = conv.role === 'owner';
  const hasActiveBooking = conv.booking_state != null && ACTIVE_BOOKING.includes(conv.booking_state);
  const lastMine = messages.find((m) => m.sender_id === me && !m.pending);
  const seen = lastMine && conv.other_read_at && conv.other_read_at >= lastMine.created_at;
  const warnContact = !conv.unlocked && looksLikeContact(draft);

  return (
    <Screen background={colors.white}>
      {/* Header */}
      <View style={styles.header}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={goBack} background="transparent" size={40} />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/vehicle/[id]',
              params: { id: conv.listing_id },
            })
          }
          style={styles.headerMain}>
          <Avatar name={conv.other_name} path={conv.other_avatar} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {conv.other_name}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {conv.title}
            </Text>
          </View>
        </Pressable>
        {conv.other_phone ? (
          <>
            <RoundIconButton
              icon={MessageCircle}
              label="WhatsApp"
              color={colors.whatsapp}
              background="transparent"
              size={40}
              onPress={() => Linking.openURL(whatsappUrl(conv.other_whatsapp ?? conv.other_phone!, '')).catch(() => {})}
            />
            <RoundIconButton
              icon={Phone}
              label="Call"
              color={colors.primary}
              background="transparent"
              size={40}
              onPress={() => Linking.openURL(telUrl(conv.other_phone!)).catch(() => {})}
            />
          </>
        ) : null}
        <RoundIconButton
          icon={EllipsisVertical}
          label="More"
          onPress={() => setMenu(true)}
          background="transparent"
          size={40}
        />
      </View>

      {/* Booking strip */}
      {hasActiveBooking && conv.booking_id ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/booking/[id]',
              params: { id: conv.booking_id! },
            })
          }
          style={styles.strip}>
          <CalendarCheck size={18} color={colors.primary} />
          <Text style={styles.stripText}>Booking</Text>
          <StatePill state={conv.booking_state!} role={conv.role} />
          <View style={{ flex: 1 }} />
          <Text style={styles.stripLink}>View</Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      ) : !owner ? (
        <View style={styles.strip}>
          <Lock size={16} color={colors.text2} />
          <Text style={[styles.stripText, { flex: 1, fontWeight: font.regular, color: colors.text2 }]}>
            Phone numbers are shared when the owner accepts a booking.
          </Text>
          <Button
            label="Book"
            size="sm"
            onPress={() =>
              router.push({
                pathname: '/book/[id]',
                params: { id: conv.listing_id },
              })
            }
          />
        </View>
      ) : !conv.unlocked ? (
        <View style={styles.strip}>
          <Lock size={16} color={colors.text2} />
          <Text style={[styles.stripText, { flex: 1, fontWeight: font.regular, color: colors.text2 }]}>
            Phone numbers are shared when you accept a booking from this customer.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {owner ? 'No messages yet' : `Ask ${conv.other_name} about the ${conv.title}`}
            </Text>
            {!owner ? (
              <Text style={styles.emptyText}>
                From {formatLKR(conv.price_per_day)} a day. Ask about dates, pickup, documents or the driver.
              </Text>
            ) : null}
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={colors.primary} style={{ margin: 12 }} /> : null
            }
            renderItem={({ item, index }) => {
              // Inverted list: the next item is the older message.
              const older = messages[index + 1];
              const showDay = !older || !sameChatDay(older.created_at, item.created_at);
              return (
                <View>
                  {showDay ? <Text style={styles.day}>{formatChatDay(item.created_at)}</Text> : null}
                  <Bubble m={item} mine={item.sender_id === me} seen={item.id === lastMine?.id && !!seen} />
                </View>
              );
            }}
          />
        )}

        {conv.blocked ? (
          <View style={styles.blocked}>
            <Ban size={18} color={colors.text2} />
            <Text style={[styles.headerSub, { flex: 1 }]}>
              {conv.blocked_by_me ? 'You blocked this chat.' : 'This chat is closed.'}
            </Text>
            {conv.blocked_by_me ? (
              <Button
                label="Unblock"
                kind="ghost"
                size="sm"
                onPress={async () => {
                  await setBlocked(id, false).catch((e) => toast(friendlyError(e), 'error'));
                  load();
                }}
              />
            ) : null}
          </View>
        ) : (
          <Composer draft={draft} setDraft={setDraft} onSend={send} warnContact={warnContact} />
        )}
      </KeyboardAvoidingView>

      <OptionSheet<string | null>
        visible={menu}
        title="Chat options"
        value={null}
        options={[
          { value: 'vehicle', label: 'View vehicle' },
          ...(conv.booking_id ? [{ value: 'booking', label: 'View booking' }] : []),
          {
            value: 'report',
            label: 'Report this chat',
            description: 'RentAnything will read it to check',
          },
          conv.blocked_by_me
            ? { value: 'unblock', label: 'Unblock' }
            : {
                value: 'block',
                label: 'Block',
                description: 'No more messages in this chat',
              },
        ]}
        onSelect={async (v) => {
          if (v === 'vehicle')
            router.push({
              pathname: '/vehicle/[id]',
              params: { id: conv.listing_id },
            });
          if (v === 'booking' && conv.booking_id)
            router.push({
              pathname: '/booking/[id]',
              params: { id: conv.booking_id },
            });
          if (v === 'report') setReporting(true);
          if (v === 'block' || v === 'unblock') {
            try {
              await setBlocked(id, v === 'block');
              toast(v === 'block' ? 'Chat blocked' : 'Chat unblocked');
              load();
            } catch (e) {
              toast(friendlyError(e), 'error');
            }
          }
        }}
        onClose={() => setMenu(false)}
      />

      <ReportSheet
        visible={reporting}
        title="Report this chat"
        subtitle="RentAnything will read this chat to check what happened."
        reasons={CHAT_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={async (reason, note) => {
          await reportConversation(id, reason, note);
          toast("Thanks, we'll look into it");
        }}
      />
    </Screen>
  );
}

function Bubble({ m, mine, seen }: { m: ChatMessage; mine: boolean; seen: boolean }) {
  if (m.kind === 'system') {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.system}>{m.body}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubbleRow, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, m.pending && { opacity: 0.6 }]}>
        <Text style={[styles.bubbleText, mine && { color: colors.white }]} selectable>
          {m.body}
        </Text>
        <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>
          {m.pending ? 'Sending…' : formatChatTime(m.created_at)}
        </Text>
      </View>
      {m.masked ? <Text style={styles.maskNote}>Contact details are hidden until a booking is accepted.</Text> : null}
      {seen ? <Text style={styles.seen}>Seen</Text> : null}
    </View>
  );
}

function Composer({
  draft,
  setDraft,
  onSend,
  warnContact,
}: {
  draft: string;
  setDraft: (t: string) => void;
  onSend: () => void;
  warnContact: boolean;
}) {
  const insets = useSafeAreaInsets();
  const canSend = draft.trim().length > 0;
  return (
    <View style={[styles.composer, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {warnContact ? (
        <View style={styles.warnRow}>
          <Text style={styles.warn}>Phone numbers, emails and links are hidden until the owner accepts a booking.</Text>
          <InfoTip help={HELP.hiddenNumbers} size={14} />
        </View>
      ) : null}
      <View style={styles.composerRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
          style={[styles.input, webNoOutline]}
          onKeyPress={(e) => {
            // Enter sends on the web; Shift+Enter adds a new line.
            const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
            if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
              (e as unknown as { preventDefault: () => void }).preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={onSend}
          style={[styles.send, !canSend && { opacity: 0.4 }]}>
          <SendHorizontal size={20} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  headerName: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  headerSub: { fontSize: 13, color: colors.text2 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.primary50,
  },
  stripText: {
    fontSize: 13,
    fontWeight: font.semibold,
    color: colors.ink,
    lineHeight: 18,
  },
  stripLink: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  list: {
    padding: 12,
    gap: 6,
    flexGrow: 1,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: font.semibold,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
  day: {
    alignSelf: 'center',
    fontSize: 12,
    color: colors.muted,
    fontWeight: font.medium,
    marginVertical: 8,
  },
  bubbleRow: { gap: 2 },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 2,
  },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  theirs: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  time: { fontSize: 11, color: colors.muted, alignSelf: 'flex-end' },
  maskNote: { fontSize: 11, color: colors.muted, maxWidth: '82%' },
  seen: { fontSize: 11, color: colors.muted },
  systemWrap: { alignItems: 'center', marginVertical: 4 },
  system: {
    fontSize: 12,
    color: colors.text2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: 'center',
    overflow: 'hidden',
  },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composer: {
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: colors.background,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  warn: { fontSize: 12, color: colors.offerText, textAlign: 'center', flexShrink: 1 },
});
