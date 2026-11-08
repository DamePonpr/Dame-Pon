---
name: Expo UI test gates
description: Reliable verification of Expo-exported feature-flag branches in isolated browser tests.
---

**Rule:** In this workspace, a requested `EXPO_PUBLIC_*` build value alone did not prove which feature-flag branch Expo/Metro placed in a web export. Browser fixtures must inspect the exported module and normalize only disposable test copies when needed; never alter app gates or `.env.production` to make a test pass.

**Why:** A mismatched export can silently exercise legacy behavior during a required-quote test (or vice versa), producing misleading UI evidence.

**How to apply:** Run the isolated UI preparation script, verify the compiled gate in each output before starting the loopback browser, and label all results as fixture-only. Any fix to Expo environment handling must preserve that check.
