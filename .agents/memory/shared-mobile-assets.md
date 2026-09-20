---
name: Shared mobile asset ownership
description: Static assets imported by packages/shared must live inside the shared package so both Expo apps can bundle them.
---

Common React Native code must import its images from `packages/shared/src/assets`, not from either app's asset directory.

**Why:** Metro resolves the import from the shared source file. App-local relative paths can pass TypeScript but produce a runtime web/native bundle failure when the shared package is consumed by the other app.

**How to apply:** When moving a component or constants module into `packages/shared`, move every referenced PNG/font/static asset with it and verify both Expo workflows bundle successfully.