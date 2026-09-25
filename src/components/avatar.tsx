// Round profile photo, or coloured initials when there's no photo.
import { Image } from 'expo-image';
import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colorIndex, initials } from '@/lib/format';
import { photoUrl } from '@/lib/supabase';
import { colors, font } from '@/theme';

const TONES = [
  { bg: colors.primary100, fg: colors.primary },
  { bg: colors.success50, fg: colors.success700 },
  { bg: colors.offer50, fg: colors.offerText },
  { bg: '#FCE7F3', fg: '#9D174D' },
  { bg: '#EDE9FE', fg: '#5B21B6' },
  { bg: '#E0F2FE', fg: '#075985' },
];

export function Avatar({
  name,
  path,
  uri,
  size = 44,
  style,
}: {
  name: string;
  path?: string | null;
  uri?: string | null; // a local photo that isn't uploaded yet
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const src = uri ?? (path ? photoUrl(path) : null);
  // Remember which photo failed, so a new photo gets a fresh try.
  const [failed, setFailed] = useState<string | null>(null);
  const tone = TONES[colorIndex(name || '?', TONES.length)];
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (src && failed !== src) {
    return (
      <View style={[box, styles.frame, style]}>
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Photo of ${name}`}
          onError={() => setFailed(src)}
        />
      </View>
    );
  }
  return (
    <View style={[box, styles.center, { backgroundColor: tone.bg }, style]} accessibilityLabel={name}>
      <Text style={{ color: tone.fg, fontWeight: font.bold, fontSize: Math.round(size * 0.38) }}>{initials(name)}</Text>
    </View>
  );
}

// Avatar with a camera badge, for changing your own photo.
export function EditableAvatar({
  name,
  path,
  size = 72,
  busy,
  onPress,
}: {
  name: string;
  path?: string | null;
  size?: number;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={path ? 'Change profile photo' : 'Add profile photo'}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <Avatar name={name} path={path} size={size} />
      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.busy, { borderRadius: size / 2 }]}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
      <View style={styles.badge}>
        <Camera size={14} color={colors.white} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  busy: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
