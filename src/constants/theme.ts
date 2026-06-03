/**
 * JNU AI College design tokens
 */

export const Colors = {
  // Brand
  primary: '#003087',   // JNU dark navy blue
  secondary: '#0066CC', // JNU medium blue
  accent: '#FFD700',    // Gold accent

  // Semantic
  success: '#28A745',
  error: '#DC3545',
  warning: '#FFC107',

  // Surfaces
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceVariant: '#EEF2F8',

  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textDisabled: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Borders
  border: '#D1D5DB',
  borderLight: '#E5E7EB',

  // Tab bar
  tabBarActive: '#003087',
  tabBarInactive: '#6B7280',
  tabBarBackground: '#FFFFFF',
} as const;

export const Typography = {
  fontSizeXs: 11,
  fontSizeSm: 13,
  fontSizeMd: 15,
  fontSizeLg: 17,
  fontSizeXl: 20,
  fontSizeXxl: 24,
  fontSizeHero: 28,

  fontWeightRegular: '400' as const,
  fontWeightMedium: '500' as const,
  fontWeightSemibold: '600' as const,
  fontWeightBold: '700' as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
} as const;
