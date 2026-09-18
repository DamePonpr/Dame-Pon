---
name: Expo theme compatibility
description: Theme overrides must be resolved in app state rather than assuming Appearance.setColorScheme exists in every Expo target.
---

Do not rely on `Appearance.setColorScheme` for Dame Pon theme selection; the installed Expo web runtime may not expose that function. Resolve the effective palette from persisted preference plus `useColorScheme()`.

**Why:** The Expo web preview crashed at startup when the API was called even though the TypeScript types allowed a related signature.

**How to apply:** Keep the three-way preference in the theme context, let `useColors` choose the effective light/dark palette, and validate both native and web previews after theme changes.