# Requests from native-ios-host

Answered by the lead on 2026-11-17 and adopted: 1 (write lengths are CSS px), 2 (unnamed export nodes only offset their
children; the iOS host no longer builds them), the 0.001 pixel-ratio tolerance.

Each item: the change I need in the contract, and the reading the iOS host uses until the lead decides.

1. **Units inside Dragon's writes.** The export says "device px", which holds for `frame` and `borderWidths` (the counter's
   2px border is 6 at 3x), but the write values are CSS px: `font.size` 24 and `border-radius` 12 match the CSS, not ×3.
   Dragon's own fixtures agree (`ms-text`: `font-size: 20px` exports `size: 20`; `ms-toggle`: `border-radius: 6px` exports 6).
   The contract's handoff section now says "All lengths in device pixels", which is wrong for writes. Change needed: the
   contract (or Dragon's `units` string) states that write lengths are CSS px. Host reading: frames and
   border widths ÷ dpr, write lengths used as points.
2. **Wrapper boxes above the component.** The export has `html` and `body` nodes that the payload does not. Change needed: say
   so in the contract. Host reading: build them as plain boxes with their frames and writes, put the payload's root inside the
   innermost one, and refuse any other export node the payload lacks (and any payload node the export lacks).
3. **Text frames after a journal entry.** Dragon lays out the initial strings only ("Count 0"). After "Count 1" the label
   keeps its build-time frame, so a longer string can clip. Change needed: either on-device layout reruns for changed text, or
   the export carries what a host does when a text's width changes. Host reading: keep the build-time frame, never resize.
4. **`activate` on a non-button element.** The contract maps `activate` to `touchUpInside`, which only a `UIControl` has.
   Change needed: say whether the compiler refuses `onClick` on non-control elements or hosts add a tap recogniser and a
   button trait. Host reading: refuse loudly at build ("only <button> is activatable on iOS yet").
5. **Element names the host does not map.** The table says "any non-control element" becomes a box. Host reading: `a`,
   `input`, `textarea`, `select`, `option`, `label`, `form`, `img`, `video`, `audio`, `canvas`, `iframe`, `svg`, `picture`,
   `object`, `embed`, `details`, `summary` and `dialog` are refused at build until a rung maps them. Change needed: the same
   list in the contract so both hosts refuse the same set.
6. **Accessibility identifiers.** The iOS host sets `accessibilityIdentifier` to the node id (`h2`, `h2:text0`) on every view,
   so Maestro can use `id:`. Proposal: the contract makes node ids the test ids on both platforms, or flows match only on text.
   A button's accessibility label is the concatenation of its text nodes, kept current by the journal applier; text inside a
   button is not a separate accessibility element; text under `h1`-`h6` carries the header trait.
7. **`@markless/core` in `@markless/mobile`.** A `.tsrx` under `packages/mobile/src` is typechecked and imports `state` from
   `@markless/core`, which the package did not list. I added it as a devDependency (`packages/mobile/package.json` and the
   lockfile, four lines). Lead: keep or move it as you prefer; proof components will need the same.
8. **Font families that are not face ids.** `ms-text` exports `font.family: "Ahem"` with an empty `fonts` list. The iOS host
   resolves a family only through `fonts` (`sha256:` id to bytes) and refuses anything else. Change needed: every font write
   names a face listed in `fonts`, or the contract names the system fonts a host may use.
9. **`synthetic-bold` and `anonymous`.** Both decode; the iOS host refuses them when resolving until their meaning is written
   down (`synthetic-bold` `keys`/`values` are not explained; `anonymous` boxes have no `native` the contract names).
10. **Export `/1` (per-state assignments).** Dragon's `native-dragon-styles` branch emits `dragon.native-style-export/1`. The
   iOS host reads only `/0` and refuses `/1` by schema. Change needed before rung 4: the journal entry that tells a host to
   switch assignment (`next[a][s][v]`), so hosts stay "changed only by journal entries".
11. **Zero-argument `String()` and `Number()`.** The reference's builtins pass `undefined` when there is no argument, so
    `String()` is `"undefined"` and `Number()` is `NaN`; JavaScript gives `""` and `0`. The iOS host mirrors the reference
    (the reference defines the meaning). Change needed: fix the reference or have the compiler refuse zero-argument calls.
12. **When storage is written.** The contract says "after every op that changes the cell"; the reference writes after every
    op on a storage cell, changed or not. The iOS host follows the reference. A `null` value removes the `UserDefaults` key,
    so after a relaunch the cell reads its `initial`, not `null` (UserDefaults cannot hold null). Change needed: the
    contract says which, and what a kept `null` means.
13. **Variants dropped.** The iOS host removed the `variants` reading after the contract replaced it with export `/1`; the
    `/0` reader rejects a `variants` field again.
