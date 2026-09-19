export const brand = {
  navy: '#081321',
  white: '#FFFFFF',
  star: '#F6C453',
  success: '#2FB36F',
  danger: '#C73E4D',
} as const;

export const typography = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    eyebrow: 10,
    caption: 12,
    body: 14,
    label: 15,
    title:  twentyEight(),
  },
} as const;

function twentyEight() {
  return 28;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  screen: 24,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const iconSizes = {
  compact: 17,
  control: 20,
  navigation: 24,
  hero: 28,
} as const;