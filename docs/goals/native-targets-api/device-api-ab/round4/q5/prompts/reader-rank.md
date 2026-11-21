Thank you. Here is the same page with three names for the namespace; the one you just read is among them. Only the name differs. Answer from this message and the earlier one alone; do not use any tools.

=== VERSION SY ===
```tsrx
import { state } from '@markless/core';
import { base, drawer, system } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';
<system.camera el={cam} class="preview" />
<system.sheet open={choosing} onChange={(open) => (choosing = open)}>
</system.sheet>
<system.pdf src="/guide.pdf" class="document" />
```
=== END VERSION SY ===

=== VERSION NT ===
```tsrx
import { state } from '@markless/core';
import { base, drawer, native } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';
<native.camera el={cam} class="preview" />
<native.sheet open={choosing} onChange={(open) => (choosing = open)}>
</native.sheet>
<native.pdf src="/guide.pdf" class="document" />
```
=== END VERSION NT ===

=== VERSION OS ===
```tsrx
import { state } from '@markless/core';
import { base, drawer, os } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';
<os.camera el={cam} class="preview" />
<os.sheet open={choosing} onChange={(open) => (choosing = open)}>
</os.sheet>
<os.pdf src="/guide.pdf" class="document" />
```
=== END VERSION OS ===

Questions:
A. Rank the three names from clearest to least clear for "drawn by the platform the app runs on, not by the page".
B. For each name, does it suggest the element exists on the website: yes, no or can't tell?
C. For each name, could it be read as a design system or component library: yes, no or somewhat?
D. Does `native` read to you as the browser's built-in element, as the phone's own UI, or as both?

Output format: `## Ranking` with lines `1. XX — reason` … `3. XX — reason`; then lines `B:`, `C:`, `D:`; end with `Tools used: none`.
