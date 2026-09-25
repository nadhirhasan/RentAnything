import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout';
import { RoundIconButton } from '@/components/ui';
import { colors, font } from '@/theme';

export const LEGAL_UPDATED = '25 September 2026';

// Simple long-form page used for the Privacy Policy and Terms of Use.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen background={colors.white}>
      <View style={styles.top}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={back} background="transparent" size={40} />
        <Text style={styles.topTitle}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.updated}>Last updated: {LEGAL_UPDATED}</Text>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function H({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.h} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

export function Li({ children }: { children: ReactNode }) {
  return (
    <View style={styles.li}>
      <Text style={styles.p}>•</Text>
      <Text style={[styles.p, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontWeight: font.semibold, color: colors.ink }}>{children}</Text>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  topTitle: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  body: { padding: 20, paddingBottom: 48, gap: 10 },
  updated: { fontSize: 13, color: colors.muted },
  h: { fontSize: 17, fontWeight: font.bold, color: colors.ink, marginTop: 14 },
  p: { fontSize: 15, color: colors.text2, lineHeight: 23 },
  li: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
});
