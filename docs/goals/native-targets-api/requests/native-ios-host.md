# Requests from native-ios-host

Each item: the change I need in the contract, and the reading the iOS host uses until the lead decides.

1. **Units inside Dragon's writes.** The export says "device px", which holds for `frame` and `borderWidths` (the counter's
   2px border is 6 at 3x), but the write values are CSS px: `font.size` 24 and `border-radius` 12 match the CSS, not ×3.
   Change needed: the contract (or Dragon's `units` string) states that write lengths are CSS px. Host reading: frames and
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
