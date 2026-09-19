---
name: NativeWind with Expo and pnpm
description: NativeWind v4 needs the CSS interop runtime exposed directly to Metro in this pnpm workspace.
---

NativeWind v4 must be configured as a Babel preset, and `react-native-css-interop` must be a direct dependency of the Expo artifact so Metro can resolve the transformed JSX runtime.

**Why:** pnpm's isolated dependency layout left the transitive CSS interop package invisible to Metro, producing a blank web preview even though TypeScript passed.

**How to apply:** For Expo artifacts using NativeWind v4, keep `nativewind/babel` in `presets`, use the NativeWind JSX import source, and declare `react-native-css-interop` directly in the artifact package.