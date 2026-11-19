# @markless/ui style bindings on phones: what waits on Dragon's typed slots (2026-11-18)

Planner ruling: a family's inline style reaches phones through Dragon. A fixed value, or a value per state, goes through
Dragon's per-state style assignments. A value computed from script while the app runs (a drag offset) waits on Dragon's
typed runtime slots (dragoncss `docs/decisions.md`, "Runtime value slots", package SOV); it is listed here, not worked
around.

The family probe (`node packages/mobile/proofs/ui-family-probe.ts`) refuses `a style binding` in 10 of 46 families. Each
binding's value was read from the family source. 9 of them are computed while the app runs and wait on typed slots;
1 (otp) is a value per state.

## Waiting on typed slots

| Family      | Part      | Custom property or property written                                                                                                                                             | Value                                         | What reads it                                                                      |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| colorpicker | root      | `--colorpicker-value` (colour), `--colorpicker-hue` (number), `--colorpicker-pure` (colour), `--colorpicker-x`, `--colorpicker-y` (percentages), `--colorpicker-alpha` (number) | the held colour                               | the app's stylesheet (backgrounds, gradients); the family paints nothing with them |
| colorpicker | thumb     | `--colorpicker-offset` (percentage), or `--colorpicker-x` and `--colorpicker-y` on the area thumb                                                                               | the held colour on that channel               | family CSS: `left`, `bottom`                                                       |
| colorpicker | swatch    | the same six as the root                                                                                                                                                        | the swatch's own colour                       | the app's stylesheet                                                               |
| crop        | area      | `--pan-x`, `--pan-y` (px)                                                                                                                                                       | the selection while the image is panned       | `transform: translate(…)`                                                          |
| crop        | selection | `--x`, `--y`, `--width`, `--height` (px)                                                                                                                                        | the selection rectangle, dragged              | `inset-inline-start`, `inset-block-start`, `inline-size`, `block-size`             |
| drawer      | content   | `--offset` (fraction 0 to 1)                                                                                                                                                    | how far a swipe has dragged the drawer        | `translate: calc(var(--offset) * ±100%)` on either axis                            |
| menu        | content   | `--x`, `--y` (px)                                                                                                                                                               | where a context-menu press landed             | `left`, `top`                                                                      |
| pad         | thumb     | `--pad-x`, `--pad-y` (percentages)                                                                                                                                              | the held point, dragged                       | `left`, `bottom`                                                                   |
| progress    | indicator | `transform` (written directly)                                                                                                                                                  | `translateX(-N%)` from value, min and max     | the element itself                                                                 |
| rating      | item      | `--rating-fill` (percentage)                                                                                                                                                    | how much of this star the shown rating covers | the app's stylesheet                                                               |
| resizable   | panel     | `--size` (number)                                                                                                                                                               | the panel's share, dragged                    | `flex: var(--size, 1) 1 0`                                                         |
| toaster     | item      | `--index` (integer), `--offset` (percentage)                                                                                                                                    | the row's place in the queue                  | the app's stylesheet                                                               |

Types the slots need: number, integer, percentage, length in px, and colour (colorpicker only). Of these 9 families only
progress has no other refusal: progress builds once Dragon's typed slots land.

## Per-state values (through Dragon)

| Family | Part  | Values                                                                                                                                                                                                                              |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| otp    | root  | fixed: `position: relative;`                                                                                                                                                                                                        |
| otp    | input | one of two fixed strings, by the `shiftPWManagers` prop: `position: absolute; inset: 0; box-sizing: border-box; height: 100%; width: 100%; opacity: 0;`, or the same with `width: calc(100% + 45px); clip-path: inset(0 45px 0 0);` |

Dragon refuses the `style` attribute itself today: `packages/dragon/src/attributes.ts` names its owner as "the
style-attribute package SOV", the same package as the typed slots. So otp's per-state style needs SOV's cascade origin
(above author rules, below author `!important`) before the native pass can hand it over. otp has 4 other refusals (a
computed that reads the item handles as a value, twice; one that reads `mine`; an `instanceof` test in its focus
handler), so carrying its style would not make it build. It is not taken now.
