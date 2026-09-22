---
name: Expo DevTools environment warning
description: Non-blocking React Native DevTools startup warning in this workspace
---

The Expo workflows and static bundle builds can succeed even when the optional React Native DevTools helper reports that `libglib-2.0.so.0` is missing.

**Why:** This environment does not provide the native library expected by the DevTools helper, but Metro and the application bundle do not depend on that helper.

**How to apply:** Treat this specific message as non-blocking after confirming Metro is listening, the preview renders, and the platform bundles complete. Do not change application code solely to remove it.