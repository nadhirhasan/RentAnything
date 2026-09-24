import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundIconButton } from '@/components/ui';
import { photoUrl } from '@/lib/supabase';
import { colors, font } from '@/theme';

// Full-screen, swipeable photo gallery (opened by tapping a listing photo).
export function PhotoViewer({
  photos,
  start,
  visible,
  onClose,
}: {
  photos: string[];
  start: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(start);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const go = (i: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, i));
    scroll.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} onShow={() => go(start)}>
      <View style={styles.root}>
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentOffset={{ x: start * width, y: 0 }}>
          {photos.map((p) => (
            <Image
              key={p}
              source={{ uri: photoUrl(p) }}
              style={{ width, height }}
              contentFit="contain"
              accessibilityLabel="Vehicle photo"
            />
          ))}
        </ScrollView>

        <View style={[styles.top, { top: insets.top + 8 }]}>
          <RoundIconButton
            icon={X}
            label="Close photos"
            onPress={onClose}
            size={40}
            background="rgba(255,255,255,0.15)"
            color={colors.white}
          />
          <Text style={styles.counter}>
            {index + 1} / {photos.length}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Arrow buttons on web / large screens, where swiping isn't natural. */}
        {Platform.OS === 'web' && photos.length > 1 ? (
          <>
            {index > 0 ? (
              <View style={[styles.arrow, { left: 16 }]}>
                <RoundIconButton
                  icon={ChevronLeft}
                  label="Previous photo"
                  onPress={() => go(index - 1)}
                  size={44}
                  background="rgba(255,255,255,0.15)"
                  color={colors.white}
                />
              </View>
            ) : null}
            {index < photos.length - 1 ? (
              <View style={[styles.arrow, { right: 16 }]}>
                <RoundIconButton
                  icon={ChevronRight}
                  label="Next photo"
                  onPress={() => go(index + 1)}
                  size={44}
                  background="rgba(255,255,255,0.15)"
                  color={colors.white}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: { color: colors.white, fontSize: 15, fontWeight: font.semibold },
  arrow: { position: 'absolute', top: '50%', marginTop: -22 },
});
