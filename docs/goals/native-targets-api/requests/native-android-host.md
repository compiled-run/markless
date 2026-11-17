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
9. **Which export state a `state` entry moves.** The contract says "the export's state `s` is the one whose key names that
   cell"; Dragon's `/1` keys are `<instance>#<state>` (`doc/app/chip#selected`). The Android host accepts a key equal to the
   cell id or ending in `#<cell id>`, and errors on zero or several matches. Please pin the exact key the style input makes
   Dragon write for a Markless cell (simplest: the cell id itself, `state:liked`).
10. **A `/1` export for a ladder rung.** Style changes driven by `state` entries are checked on the JVM against Dragon's
    `ms-toggle` export only; the device check needs a `/1` export whose node ids are a rung payload's (rung 4's).
11. **Rung 2 on device is blocked on its export (2026-11-17, ~03:45).** `cw/native-targets` has no
    `packages/mobile/proofs/02-styles/native-style.json`, and `origin/cw/native-dragon-styles` (head `d6a4da5f0d`) has no
    command that reads `markless.native-style-input/0`; its `/1` exports are for Dragon's own `ms-*` fixtures, with Dragon ids.
    The Android host needs exactly: `dragon.native-style-export/1` for the 02-styles payload, `targets.android` at
    `dpr` 2.625 (Pixel 7, 411 x 818 dp), node ids equal to the payload's (`h0`, `h1:text0`...), every face it names listed in
    `fonts` with a file under the Dragon checkout, and (for rung 4) a state whose key the host can map to `state:liked`
    (request 9). The host reads it today: `/0` and `/1` decode, frames are checked on device by the frame report
    (`frames max gap ... device px`), and `state` entries move through `next`. Owner of the Dragon side: native-dragon-styles.
