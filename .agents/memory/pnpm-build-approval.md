---
name: pnpm build approval
description: How pnpm 10 stores approvals for dependency build scripts in this workspace.
---

For pnpm 10.26, `pnpm approve-builds` has no non-interactive approval flag and writes approved packages to the root `pnpm-workspace.yaml` `onlyBuiltDependencies` setting, not to `pnpm-lock.yaml`. When that setting already includes a package, the command exits with “There are no packages awaiting approval.”

**Why:** EAS reported the obsolete `package.json` location even though the approval was already present in the workspace configuration.

**How to apply:** Keep build approvals only in the root workspace YAML; do not expect an approval-only lockfile diff or create an empty lockfile commit.