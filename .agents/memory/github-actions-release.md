---
name: GitHub Actions release uploads
description: Push commits and retrieve Android preview releases through the repository workflow without exposing credentials.
---

The workspace's `GH_TOKEN` can authenticate GitHub CLI API calls, but Git HTTPS does not automatically use it for `git push`. Configure Git's credential helper with `gh auth setup-git` in the same environment before pushing.

**Why:** A direct `git push` rejected the token even though `gh repo view` succeeded; the helper made the push and release workflow reliable.

**How to apply:** Use `GH_TOKEN="$GH_TOKEN" gh auth setup-git` before `git push`, then monitor the repository's Android workflow and verify the generated release assets by tag and run number.