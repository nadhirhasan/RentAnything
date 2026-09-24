// App-wide feedback: toast messages and confirm dialogs. React Native's
// Alert does nothing on web, so both are built with plain views.
import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nativeDriver } from '@/components/ui';
import { colors, font, radius } from '@/theme';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; text: string; tone: Tone };

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type FeedbackState = {
  toast: (text: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackState | null>(null);

const TOAST_ICONS: Record<Tone, { icon: LucideIcon; color: string }> = {
  success: { icon: CircleCheck, color: '#4ADE80' },
  error: { icon: CircleAlert, color: '#F87171' },
  info: { icon: Info, color: '#93C5FD' },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(
    null,
  );
  const nextId = useRef(0);

  const toast = useCallback((text: string, tone: Tone = 'success') => {
    setCurrent({ id: ++nextId.current, text, tone });
  }, []);

  const clearToast = useCallback(() => setCurrent(null), []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    dialog?.resolve(ok);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      {current ? <ToastView key={current.id} toast={current} onDone={clearToast} /> : null}
      <Modal visible={dialog != null} transparent animationType="fade" onRequestClose={() => close(false)}>
        <Pressable style={styles.backdrop} onPress={() => close(false)} accessibilityLabel="Close dialog">
          <Pressable style={styles.dialog} accessibilityRole="alert" onPress={() => {}}>
            <Text style={styles.dialogTitle}>{dialog?.title}</Text>
            {dialog?.message ? <Text style={styles.dialogText}>{dialog.message}</Text> : null}
            <View style={styles.dialogButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => close(false)}
                style={({ pressed }) => [styles.dialogButton, styles.cancel, pressed && styles.pressed]}>
                <Text style={[styles.dialogButtonText, { color: colors.ink }]}>
                  {dialog?.cancelLabel ?? 'Cancel'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => close(true)}
                style={({ pressed }) => [
                  styles.dialogButton,
                  { backgroundColor: dialog?.destructive ? colors.danger : colors.primary },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.dialogButtonText, { color: colors.white }]}>
                  {dialog?.confirmLabel ?? 'OK'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  const { icon: Icon, color } = TOAST_ICONS[toast.tone];

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: nativeDriver }),
      Animated.delay(toast.tone === 'error' ? 3500 : 2200),
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: nativeDriver }),
    ]);
    seq.start(({ finished }) => finished && onDone());
    return () => seq.stop();
  }, [anim, toast, onDone]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toastWrap,
        {
          // Above tab bars and sticky footers, like a snackbar.
          bottom: insets.bottom + 96,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}>
      <View style={styles.toast}>
        <Icon size={20} color={color} />
        <Text style={styles.toastText}>{toast.text}</Text>
      </View>
    </Animated.View>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', pointerEvents: 'none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
  },
  toastText: { flexShrink: 1, color: colors.white, fontSize: 14, fontWeight: font.medium },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 24,
    gap: 8,
  },
  dialogTitle: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
  dialogText: { fontSize: 14, color: colors.text2, lineHeight: 20 },
  dialogButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  dialogButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: colors.background },
  dialogButtonText: { fontSize: 15, fontWeight: font.semibold },
  pressed: { opacity: 0.85 },
});
