// Design tokens from the Figma file "RentAnything — App Design v1" (Style sheet).

export const colors = {
  primary: '#1D4ED8',
  primary50: '#EFF6FF',
  primary100: '#DBEAFE',
  ink: '#0F172A',
  text2: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  background: '#F1F5F9',
  white: '#FFFFFF',
  whatsapp: '#15803D',
  success50: '#DCFCE7',
  success700: '#166534',
  offer50: '#FEF3C7',
  offerText: '#92400E',
  switchOff: '#CBD5E1',
  danger: '#B91C1C',
  overlay: 'rgba(15, 23, 42, 0.55)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const font = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// Content never gets wider than a phone layout on web / tablets.
export const maxContentWidth = 560;
