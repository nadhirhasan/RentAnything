import { router } from 'expo-router';
import { Lock, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { colors, font, maxContentWidth, space } from '@/theme';

// Full-screen background + safe area, with content capped to phone width on
// wide (web / tablet) screens.
export function Screen({
  children,
  edges = ['top'],
  background = colors.background,
}: {
  children: ReactNode;
  edges?: Edge[];
  background?: string;
}) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: background }}>
      <View style={styles.column}>{children}</View>
    </SafeAreaView>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  style,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function SignInPrompt({ title, text }: { title: string; text: string }) {
  return (
    <EmptyState
      icon={Lock}
      title={title}
      text={text}
      action={
        <Button
          label="Sign in or create account"
          onPress={() => router.push('/sign-in')}
          style={{ alignSelf: 'stretch' }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  empty: { alignItems: 'center', gap: space.md, padding: space.xxl, paddingTop: 48 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: font.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 20 },
});
