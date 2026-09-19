/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

import { brand } from '@/constants/designSystem';

const colors = {
  light: {
    text: brand.white,
    tint: brand.star,

    background: brand.navy,
    foreground: brand.white,

    card: '#102235',
    cardForeground: brand.white,

    primary: brand.star,
    primaryForeground: brand.navy,

    secondary: '#17304D',
    secondaryForeground: brand.white,

    muted: '#0D1D2D',
    mutedForeground: 'rgba(255,255,255,0.72)',

    accent: '#203B59',
    accentForeground: brand.white,

    destructive: brand.danger,
    destructiveForeground: brand.white,
    star: brand.star,

    border: 'rgba(255,255,255,0.20)',
    input: '#17304D',
  },

  dark: {
    text: brand.white,
    tint: brand.white,

    background: brand.navy,
    foreground: brand.white,

    card: 'rgba(255,255,255,0.08)',
    cardForeground: brand.white,

    primary: brand.star,
    primaryForeground: brand.navy,

    secondary: 'rgba(255,255,255,0.12)',
    secondaryForeground: brand.white,

    muted: 'rgba(255,255,255,0.06)',
    mutedForeground: 'rgba(255,255,255,0.72)',

    accent: 'rgba(255,255,255,0.16)',
    accentForeground: brand.white,

    destructive: '#FF9DA7',
    destructiveForeground: brand.navy,
    star: brand.star,

    border: 'rgba(255,255,255,0.20)',
    input: 'rgba(255,255,255,0.12)',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
  star: brand.star,
};

export default colors;
