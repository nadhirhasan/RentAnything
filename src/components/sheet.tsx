import { Check } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, maxContentWidth, radius } from '@/theme';

// Bottom sheet with a list of options (e.g. "Sort by"), like the pickers in
// Booking.com / Daraz. Tapping outside closes it.
export function OptionSheet<T extends string | number | null>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string; description?: string }[];
  value: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(o.value);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.label, selected && { color: colors.primary }]}>{o.label}</Text>
                  {o.description ? <Text style={styles.description}>{o.description}</Text> : null}
                </View>
                {selected ? <Check size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.switchOff,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: font.bold, color: colors.ink, paddingHorizontal: 12, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  label: { fontSize: 16, fontWeight: font.medium, color: colors.ink },
  description: { fontSize: 13, color: colors.text2 },
});
