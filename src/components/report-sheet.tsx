import { Flag } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/supabase';
import type { ReportReason } from '@/lib/trust';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Bottom sheet: pick a reason, add an optional note, send.
export function ReportSheet({
  visible,
  title,
  subtitle,
  reasons,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  reasons: { value: ReportReason; label: string; description: string }[];
  onSubmit: (reason: ReportReason, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setReason(null);
    setNote('');
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!reason) {
      setError('Choose a reason');
      return;
    }
    if (reason === 'other' && !note.trim()) {
      setError('Tell us what happened');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason, note.trim());
      setBusy(false);
      setReason(null);
      setNote('');
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close">
          <Pressable onPress={() => {}} style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            <View style={styles.grabber} />
            <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <View style={styles.icon}>
                  <Flag size={20} color={colors.danger} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.subtitle}>{subtitle}</Text>
                </View>
              </View>
              <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                {reasons.map((r) => {
                  const selected = reason === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setReason(r.value);
                        setError(null);
                      }}
                      style={[styles.reason, selected && styles.reasonSelected]}>
                      <View style={[styles.radio, selected && { borderColor: colors.primary }]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.reasonLabel}>{r.label}</Text>
                        <Text style={styles.reasonText}>{r.description}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label={reason === 'other' ? 'What happened?' : 'Add details (optional)'}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={500}
                placeholder="Anything that helps us check this"
              />
              {error ? <Notice tone="danger" text={error} /> : null}
              <Button label="Send report" onPress={send} loading={busy} />
              <Text style={styles.small}>
                Reports are private. The owner won&apos;t see who reported them.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    maxHeight: '92%',
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.switchOff,
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
  subtitle: { fontSize: 13, color: colors.text2 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonSelected: { borderColor: colors.primary, backgroundColor: colors.primary50 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.switchOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  reasonLabel: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  reasonText: { fontSize: 12, color: colors.text2 },
  small: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
