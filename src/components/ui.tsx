// Shared UI pieces matching the Figma design (Button, Chip, Tag, Toggle,
// Field, Segmented, Section...).
import type { LucideIcon } from 'lucide-react-native';
import { CircleHelp, Eye, EyeOff, Minus, Plus, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { Help } from '@/lib/help';
import { colors, font, radius, space } from '@/theme';

type ButtonKind = 'primary' | 'whatsapp' | 'ghost' | 'soft' | 'danger';

const buttonColors: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.white },
  whatsapp: { bg: colors.whatsapp, fg: colors.white },
  ghost: { bg: colors.white, fg: colors.ink, border: colors.border },
  soft: { bg: colors.primary50, fg: colors.primary },
  danger: { bg: colors.white, fg: colors.danger, border: colors.border },
};

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon: Icon,
  size = 'lg',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  size?: 'lg' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = buttonColors[kind];
  const small = size === 'sm';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: c.bg,
          borderColor: c.border ?? c.bg,
          height: small ? 40 : 52,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {Icon ? <Icon size={small ? 18 : 20} color={c.fg} /> : null}
          <Text style={[styles.buttonText, { color: c.fg, fontSize: small ? 14 : 16 }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.white, borderColor: colors.border },
      ]}>
      {Icon ? <Icon size={16} color={selected ? colors.white : colors.text2} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.white : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({
  label,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'primary' | 'success' | 'offer' | 'dark';
}) {
  const t = {
    neutral: { bg: colors.background, fg: colors.text2 },
    primary: { bg: colors.primary50, fg: colors.primary },
    success: { bg: colors.success50, fg: colors.success700 },
    offer: { bg: colors.offer50, fg: colors.offerText },
    dark: { bg: 'rgba(15, 23, 42, 0.8)', fg: colors.white },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={14} color={t.fg} /> : null}
      <Text style={[styles.tagText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Toggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      onPress={() => onChange(!value)}
      disabled={disabled}
      hitSlop={8}
      style={[
        styles.toggle,
        { backgroundColor: value ? colors.primary : colors.switchOff, opacity: disabled ? 0.5 : 1 },
      ]}>
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

// Short explanation behind a "?" icon, shown in a popup.
export type { Help };

export function InfoTip({ help, size = 16 }: { help: Help; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What is ${help.title}?`}
        hitSlop={10}
        onPress={() => setOpen(true)}>
        <CircleHelp size={size} color={colors.muted} />
      </Pressable>
      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.helpBackdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
            <Pressable onPress={() => {}} style={styles.helpCard}>
              <View style={styles.helpHead}>
                <CircleHelp size={20} color={colors.primary} />
                <Text style={styles.helpTitle}>{help.title}</Text>
              </View>
              <Text style={styles.helpText}>{help.text}</Text>
              <Button label="Got it" kind="soft" size="sm" onPress={() => setOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

// A label with an optional "?" help icon next to it.
export function LabelRow({ text, help, style }: { text: string; help?: Help; style?: StyleProp<TextStyle> }) {
  if (!help) return <Text style={style}>{text}</Text>;
  return (
    <View style={styles.labelRow}>
      <Text style={[style, { flexShrink: 1 }]}>{text}</Text>
      <InfoTip help={help} />
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
  help,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  help?: Help;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <LabelRow text={title} help={help} style={styles.toggleTitle} />
        {subtitle ? <Text style={styles.subtle}>{subtitle}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} label={title} />
    </View>
  );
}

export function Field({
  label,
  prefix,
  suffix,
  error,
  hint,
  multiline,
  password,
  clearable,
  inputRef,
  style,
  onFocus,
  onBlur,
  help,
  ...input
}: TextInputProps & {
  label?: string;
  help?: Help;
  prefix?: string;
  suffix?: string;
  error?: string | null;
  hint?: string;
  // Password field with a show / hide button.
  password?: boolean;
  // Shows an × button that clears the value.
  clearable?: boolean;
  inputRef?: RefObject<TextInput | null>;
  style?: StyleProp<ViewStyle>;
}) {
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const hasValue = Boolean(input.value);

  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <LabelRow text={label} help={help} style={styles.label} /> : null}
      {/* The whole box focuses the input, not just the text area. */}
      <Pressable
        onPress={() => ref.current?.focus()}
        accessible={false}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          input.editable === false && { backgroundColor: colors.background },
        ]}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          multiline={multiline}
          secureTextEntry={password ? hidden : input.secureTextEntry}
          autoCapitalize={password ? 'none' : input.autoCapitalize}
          autoCorrect={password ? false : input.autoCorrect}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.inputText, multiline && styles.inputTextMultiline, webNoOutline]}
          {...input}
        />
        {clearable && hasValue && input.editable !== false ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? 'text'}`}
            hitSlop={10}
            onPress={() => {
              input.onChangeText?.('');
              ref.current?.focus();
            }}
            style={styles.clear}>
            <X size={14} color={colors.white} strokeWidth={3} />
          </Pressable>
        ) : null}
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={10}
            onPress={() => setHidden((h) => !h)}>
            {hidden ? <Eye size={20} color={colors.text2} /> : <EyeOff size={20} color={colors.text2} />}
          </Pressable>
        ) : null}
      </Pressable>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// Browsers draw their own focus box inside the field; we show focus on the
// field's border instead. Chrome's default outline style is "auto", which
// ignores outline-width, so the style itself must be "none" (react-native-web
// passes it straight to CSS; React Native's types only list solid/dotted/dashed).
export const webNoOutline: TextStyle | null =
  Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle) : null;

// The native animation driver doesn't exist on web; it falls back with a warning.
export const nativeDriver = Platform.OS !== 'web';

export function Segmented<T extends string | number | boolean | null>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text
              style={[
                styles.segmentText,
                selected && { color: colors.ink, fontWeight: font.semibold },
              ]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 365,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  help?: Help;
}) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <LabelRow text={label} help={help} style={styles.label} />
      <View style={styles.stepper}>
        <RoundIconButton
          icon={Minus}
          label={`Decrease ${label}`}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        />
        <Text style={{ fontSize: 16, fontWeight: font.semibold, color: colors.ink }}>{value}</Text>
        <RoundIconButton
          icon={Plus}
          label={`Increase ${label}`}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        />
      </View>
    </View>
  );
}

export function RoundIconButton({
  icon: Icon,
  onPress,
  label,
  size = 36,
  background = colors.background,
  color = colors.ink,
  disabled,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
  background?: string;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}>
      <Icon size={Math.round(size / 2)} color={color} />
    </Pressable>
  );
}

export function Section({
  title,
  help,
  children,
  style,
}: {
  title?: string;
  help?: Help;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? <LabelRow text={title} help={help} style={styles.sectionTitle} /> : null}
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Group({
  title,
  subtitle,
  help,
  children,
}: {
  title: string;
  subtitle?: string;
  help?: Help;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <LabelRow text={title} help={help} style={styles.groupTitle} />
        {subtitle ? <Text style={styles.subtle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function KeyValue({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: Help }) {
  return (
    <View style={styles.kv}>
      <LabelRow text={label} help={help} style={styles.kvLabel} />
      <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 1 }}>
        <Text style={styles.kvValue}>{value}</Text>
        {sub ? <Text style={styles.kvSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// Grey placeholder block that gently pulses while content loads.
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: colors.border, borderRadius: radius.sm, opacity }, style]} />;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function Wrap({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

export function Notice({
  icon: Icon,
  text,
  tone = 'primary',
  help,
}: {
  icon?: LucideIcon;
  text: string;
  tone?: 'primary' | 'danger';
  help?: Help;
}) {
  const fg = tone === 'danger' ? colors.danger : colors.primary;
  const bg = tone === 'danger' ? '#FEF2F2' : colors.primary50;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      {Icon ? <Icon size={18} color={fg} /> : null}
      <Text style={{ flex: 1, color: fg, fontSize: 13, lineHeight: 18 }}>{text}</Text>
      {help ? <InfoTip help={help} size={18} /> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonText: { fontWeight: font.semibold },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: font.medium },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  tagText: { fontSize: 12, fontWeight: font.medium },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleTitle: { fontSize: 15, fontWeight: font.medium, color: colors.ink },
  subtle: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: font.medium, color: colors.text2 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  inputMultiline: { height: 112, alignItems: 'flex-start', paddingVertical: 12 },
  inputFocused: {
    borderColor: colors.primary,
    boxShadow: '0 0 0 3px rgba(29, 78, 216, 0.15)',
  },
  inputError: { borderColor: colors.danger },
  inputText: {
    flex: 1,
    alignSelf: 'stretch',
    fontSize: 15,
    color: colors.ink,
    minWidth: 0,
    paddingVertical: 0,
  },
  inputTextMultiline: { textAlignVertical: 'top' },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  affix: { fontSize: 15, color: colors.muted, fontWeight: font.medium },
  error: { fontSize: 12, color: colors.danger },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentSelected: { backgroundColor: colors.white, borderColor: colors.border },
  segmentText: { fontSize: 14, fontWeight: font.medium, color: colors.text2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  section: { backgroundColor: colors.white, padding: space.lg, gap: space.md },
  sectionTitle: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 14,
  },
  groupTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  kvLabel: { fontSize: 14, color: colors.text2, flexShrink: 0 },
  kvValue: { fontSize: 14, fontWeight: font.semibold, color: colors.ink, textAlign: 'right' },
  kvSub: { fontSize: 12, color: colors.muted, textAlign: 'right' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  helpBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  helpCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  helpHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helpTitle: { flex: 1, fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  helpText: { fontSize: 14, lineHeight: 21, color: colors.text2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
  },
});
