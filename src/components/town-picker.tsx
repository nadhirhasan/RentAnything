import { Crosshair, MapPin, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoundIconButton, webNoOutline } from '@/components/ui';
import { searchTowns, type Town } from '@/lib/towns';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Full-screen list of towns with search, plus an optional "use my current
// location" row at the top.
export function TownPicker({
  visible,
  title,
  onClose,
  onPick,
  onUseGps,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (t: Town) => void;
  onUseGps?: () => void;
}) {
  const [query, setQuery] = useState('');
  const towns = useMemo(() => searchTowns(query), [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={styles.column}>
          <View style={styles.header}>
            <RoundIconButton icon={X} label="Close" onPress={onClose} background="transparent" size={40} />
            <Text style={styles.title}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.search}>
            <Search size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search town or district"
              placeholderTextColor={colors.muted}
              style={[{ flex: 1, alignSelf: 'stretch', fontSize: 15, color: colors.ink }, webNoOutline]}
              autoFocus
              accessibilityLabel="Search town or district"
            />
          </View>
          <FlatList
            data={towns}
            keyExtractor={(t) => t.name}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              onUseGps ? (
                <Pressable style={styles.row} onPress={onUseGps} accessibilityRole="button">
                  <Crosshair size={20} color={colors.primary} />
                  <Text style={[styles.town, { color: colors.primary }]}>Use my current location</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => onPick(item)} accessibilityRole="button">
                <MapPin size={20} color={colors.text2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.town}>{item.name}</Text>
                  <Text style={styles.district}>{item.district} District</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  title: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  town: { fontSize: 15, fontWeight: font.medium, color: colors.ink },
  district: { fontSize: 13, color: colors.text2 },
});
