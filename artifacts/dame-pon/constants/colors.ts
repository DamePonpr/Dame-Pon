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

const colors = {
  light: {
    text: '#0B1C26',
    tint: '#0B1C26',

    background: '#ffffff',
    foreground: '#0B1C26',

    card: '#F5F8FA',
    cardForeground: '#0B1C26',

    primary: '#0B1C26',
    primaryForeground: '#ffffff',

    secondary: '#E8F0F3',
    secondaryForeground: '#0B1C26',

    muted: '#EEF3F5',
    mutedForeground: '#64747C',

    accent: '#DCE9EE',
    accentForeground: '#0B1C26',

    destructive: '#C73E4D',
    destructiveForeground: '#ffffff',

    border: '#D6E1E6',
    input: '#D6E1E6',
  },

  dark: {
    text: '#F4F8FA',
    tint: '#F4F8FA',

    background: '#0B151B',
    foreground: '#F4F8FA',

    card: '#14242C',
    cardForeground: '#F4F8FA',

    primary: '#1C4050',
    primaryForeground: '#F4F8FA',

    secondary: '#20353F',
    secondaryForeground: '#F4F8FA',

    muted: '#1A2B33',
    mutedForeground: '#B7C8CF',

    accent: '#29434E',
    accentForeground: '#F4F8FA',

    destructive: '#FF8C98',
    destructiveForeground: '#281014',

    border: '#30464F',
    input: '#30464F',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
