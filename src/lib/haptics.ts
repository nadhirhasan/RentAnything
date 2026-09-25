// Light vibration on taps, like native apps. Phones only (does nothing on web).
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

// Buttons.
export function tapFeedback() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Switches, chips, tabs: picking something.
export function selectFeedback() {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}
