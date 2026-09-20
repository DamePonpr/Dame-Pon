---
name: Android APK workflow compatibility
description: Durable build constraints for the Dame Pon Expo Android APK workflow.
---

For the Dame Pon Android release workflow, keep Babel packages referenced by the app's Babel configuration declared directly in the mobile package. With pnpm's isolated dependency layout, transitive availability is not enough for the Gradle bundling step; the Expo preset and any Babel plugins it loads must be direct dependencies.

The legacy `@react-native-community/clipboard@1.5.1` package is not compatible with the current React Native/Gradle toolchain as published. The CI workflow must patch its repository declaration from `jcenter()` to `mavenCentral()` and adapt its Android module from the removed `ContextBaseJavaModule` API to `ReactContextBaseJavaModule` before assembling the release APK.

The two matrix builds must upload their APKs first; a separate release job should download both artifacts and publish one combined GitHub release. Native release assembly should use an explicit 4 GB Gradle heap and at most two workers because D8 can otherwise run out of Java heap during dex merging.

**Why:** GitHub Actions reached the native build only after these issues were surfaced one at a time; local workspace resolution can hide missing direct dependencies and older native APIs.

**How to apply:** When changing Expo or React Native versions, run the GitHub Android workflow from a clean checkout and inspect the first failing step before changing app code. Preserve the direct Babel declarations, recheck whether the clipboard patches are still needed after dependency upgrades, and keep release creation after both matrix jobs succeed.