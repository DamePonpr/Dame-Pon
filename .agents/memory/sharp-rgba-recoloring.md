---
name: Sharp RGBA recoloring
description: Recoloring behavior to preserve when generating launch assets with Sharp.
---

When recoloring a white RGBA mask whose visual shape is carried by alpha, replace the RGB channels explicitly and preserve alpha rather than relying on `sharp.tint()`.

**Why:** In the workspace's Sharp version, `tint()` left this white RGBA mask white, which made the conductor's navy foreground disappear against its white background.

**How to apply:** For generated launcher or splash masks, decode to raw RGBA, write the target RGB values into every pixel, keep the original alpha channel, and then encode the result as PNG.