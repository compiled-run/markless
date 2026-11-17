# Requests from native-android-host

1. **A button's text on Android.** The contract maps `button` to `android.widget.Button` and a text node to a `TextView` child,
   but a `Button` is itself a `TextView` and cannot hold children. What I built (the conservative reading): the button's one
   text run is the Button's own text; a button with a second text run or an element child is a loud host error. With a style
   export, the text run's frame becomes the Button's padding. Please either confirm this in the table, or change the Android
   cell to "`FrameLayout` with `accessibilityClassName = android.widget.Button`, clickable, focusable" if buttons with icons
   or several runs are coming soon.
2. **Units in `dragon.native-style-export/0`.** The export says "device px", which holds for frames and `borderWidths`, but
   the counter's `font.size` (20 and 24) and `border-radius` lengths (12) read as CSS px. I multiply both by the export's
   `dpr`. Please have the export (or the contract) state the unit per field. Update after the contract's handoff section
   ("All lengths in device pixels"): that does not match the counter export. Read as device px, `font.size` 20 would be a
   7.6 dp font, while Dragon's own text frame for it is 64 device px tall, which is Inter's normal line height at
   20 CSS px x 2.625. Scaling `font.size` and radii by `dpr` gives every edge within 0.98 device px of Dragon's frames on the
   Pixel 7 AVD. Please correct the contract (or Dragon's export) so iOS reads the same units.
3. **The export carries `html` and `body` nodes** that are not in the payload. I add their frames into the root's position and
   ignore their writes. Please confirm that the document wrapper's paint (e.g. a `body` background) is not meant to reach the
   device, or name which node's background fills the screen.
4. **Pixel ratio.** The host refuses an export whose `dpr` differs from the device's by more than 0.001, since frames are
   device px. If the harness needs one export for several devices, the export would need CSS px frames instead.
5. **Vectors for `set` and `toggle`.** `packages/mobile/conformance/` has only the counter (`add`). The Android host implements
   `set` and `toggle` (with JavaScript truthiness: `toggle` on `0` gives `true`) and checks them with its own JVM cases, but
   only a shared vector holds iOS and Android to one meaning. Please add one (e.g. a toggle whose text reads a boolean and a
   number, and a `set` that leaves text unchanged, which must journal nothing).
6. **`synthetic-bold` write.** The contract lists it but not its fields. The Android host refuses it loudly until its shape is
   written down (Android would map it to `Paint.isFakeBoldText`).
7. **The attribute value rule is restated in Kotlin.** `marklessAttributeValue`'s name lists (`SPELLS_FALSE`,
   `ENUMERATED_BOOLEAN_ATTRIBUTE`) are copied into `core/AttributeValue.kt`, because Kotlin cannot import them. To keep the
   copy honest, please add a vector (or a generated JSON table under `packages/mobile/conformance/`) that writes `true`,
   `false`, a string and a number to every name in both lists plus one plain, one `aria-` and one `data-` name; the JVM test
   will then catch any drift.
8. **Dragon exports per rung.** Rung 2 on the device is proven only with Dragon's hand-transcribed counter export. Rungs 2
   and 4 need `proofs/<rung>/native-style.json` from the native-dragon-styles CLI, and rung 4's needs `variants`, before the
   styled half of those rungs can be checked on Android.
