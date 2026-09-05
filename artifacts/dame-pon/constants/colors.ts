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

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
