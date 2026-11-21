# Four style gaps not built on `cw/dragon-bugs`, and what each would take

Status 2026-11-18. The constraint for each: the phone must end up looking like the web page. All four stay refused by name
today (`styles-contract.md` section 6b). Costs are rough: S is a day, M a few days, L a week or more of work, each with its
Chrome-measured tests and its device rung.

The thread through all four is one decision. Dragon's own design puts the on-device work (its layout engine, hit testing and
interaction runtime) into generated Swift and Kotlin that it translates from its TypeScript reference (`packages/layout/src`,
`rt-*.ts`; generated code in `packages/layout/generated/`). The Markless hosts run no Dragon code: they apply the JSON export,
whose frames are laid out at build time for one device size. Pressed, focus-visible and width-based `@media` all need that
on-device code. Choosing to link it into the hosts unlocks all three at once; not choosing it means three separate
approximations, each of which would break Dragon's "numbers decide" rule somewhere.

## Pressed (`:active`)

What Dragon has: `:active` compiles inside its parity and device lanes, as interaction tables under each state assignment
(ruling R7, at most 256 per assignment), run by the translated `rt-interaction.ts` and hit-tested by `rt-hit.ts`, both checked
against Chrome traces (R12 to R14). The Markless entry point stops with "the output has interaction states, which this entry
point does not emit yet". Two more refusals sit underneath: hit testing through a form control (FORM-a) and through rounded
corners (SELD-R2b).

Within Dragon's rules: (1) the Markless export carries the interaction tables (S, Dragon); (2) the hosts link the generated
`rt-hit` and `rt-interaction` and feed them touches, so a press selects exactly what Chrome's `:active` chain selects (M per
host); (3) lift FORM-a and SELD-R2b for the buttons the families use, since nearly every button has rounded corners (M, Dragon).
Total about L.

The shortcut, a host marking the view under the finger as pressed, is cheaper (S) but does not match the web: UIKit and Android
hit-test rectangles, Chrome hit-tests rounded corners and marks every ancestor `:active` too. Not recommended.

## `:focus-visible`

Needs everything pressed needs (the same runtime: focus is one of the R4 dimensions), plus Blink's focus-visible heuristic,
already ruled (R8: pointer focus gives it only to text entry). On a phone without a hardware keyboard that means: only a text
field shows it. But text inputs are not laid out by Dragon yet (`<input type=text>` waits for FORM-b), so the one place a phone
shows `:focus-visible` is blocked first by FORM-b. Order: FORM-b text inputs (L, Dragon), then the runtime above, then this (S).

## Width-based `@media` (and orientation)

The export's frames are computed at build time for one device size (iPhone 17, Pixel 7). A width band changes layout, and the
real screen width is only known on the device (other phones, landscape, iPad split view). Dragon's ruling ("Native viewports")
is to lay out on the device with its translated engine, which the generated code carries.

Within Dragon's rules: the export carries the engine input per assignment (Dragon already builds it; S), the hosts link
`packages/layout/generated` and lay out on the device whenever the size or band changes (L per host; this replaces the
build-time frames, so every styled rung is re-proven), and the hosts evaluate `width` and `orientation` atoms (S). This is
also what makes any styled page right on a phone other than the two proof devices, which today is silently wrong.

A cheaper approximation, one export per known device width, matches only those widths: not recommended.

## The platform's system font (`system-ui`, unset `sans-serif`)

Built in round three (2026-11-18): measured at build time from the platform's own font; see `styles-contract.md` 6c,
round three. The text below is the state before it.

Dragon lays out text from the bundled font file's own tables at build time ("Pinned generic fonts", "Native glyph advances",
"Dragon positions every glyph"), so it can only lay out a font it ships. San Francisco cannot be redistributed. Roboto (Apache
2.0) can.

Options that keep the phone equal to the web:

1. **Make the web match the phone (recommended, S):** a native-configured app ships its pinned face to the web too (design
   principle 4, "the web output comes from the same compiled result"). The web then shows Inter, as the phone does.
2. **Per-platform pinned faces (M):** Roboto pinned for Android, a licensable SF-alike for iOS; the web column then needs the same
   face per phone to compare, so the web still differs from Safari's system font.
3. **Native text layout in the system face (L, conflicts with rulings):** the hosts shape and lay out text themselves; Dragon's
   frames would no longer be the frames drawn, so its Chrome comparison would no longer prove what the phone shows. Needs an
   owner ruling against "Dragon positions every glyph".

### Measured 2026-11-18 (owner: measure at build time where the build machine has the font)

Nothing is built for the system font; these are measurements. Strings: 10 (Latin, digits, diacritics, `iiii`/`WWWW`, a
pangram), sizes 11, 13, 15, 17, 20, 28, 34, regular and bold; line breaks: two paragraphs, greedy word wrap at 280, 343 and
390 points/dp, 15 and 17, regular and bold (24 cases). Widths are each platform's own text engine (iOS: CoreText `CTLine`
typographic width of `CTFontCreateUIFontForLanguage(.system)`; Android: `Paint.getRunAdvance` with `Typeface.DEFAULT`
in an installed app). Tools: `/tmp`-built probes, not committed.

| Build-time numbers | Device | Largest width difference | Line breaks that differ |
| --- | --- | --- | --- |
| Mac (macOS 27.2.1) CoreText, `.SFNS` | iOS 27.2 (24B8117) simulators: iPhone 17, iPhone SE (3rd gen), iPhone 17 Pro Max, iPad mini (A17 Pro) | 0.000 pt (0.00 device px) | 0 of 24 each |
| same | iOS 27.2 (24B91016s) iPhone-Duo simulator | 0.000 pt | 0 of 24 |
| HarfBuzz 15.1 on the device's own `/system/fonts/Roboto-Regular.ttf` (Roboto 3.005, variable `wght`/`wdth`/`ital`, at the `fonts.xml` instance) | Android 36 (google_apis arm64): Pixel 7 (420 dpi), Pixel 3a (440), Pixel Tablet (320) | 0.100, 0.088, 0.071 device px | 0 of 24 each |
| HarfBuzz on Dragon's vendored Roboto 3.016 (static Regular; regular weight only) | same three | 0.100, 0.084, 0.045 device px | 0 of 12 each |

The Mac's system font file and the simulator's are different files (`SFNS.ttf` 7,872,432 bytes, `SFUI.ttf` 7,872,452 bytes,
different hashes) with equal advances here. Android's three devices agree with each other to 0.031 dp. Only one iOS runtime
(27.2, two builds) and one Android API level (36) are installed on this machine, so differences between OS versions are not
measured; a real device was not measured either.

What Dragon would need to measure with them at build time without shipping them: read the font file from the build machine
(San Francisco: the iOS SDK's simulator runtime `SFUI.ttf`, the file the iOS runtime itself uses, rather than the Mac's own;
Roboto: the Android system image's `Roboto-Regular.ttf` for the target API, or the open-licence file vendored at that exact
version); variable-font instances (both are variable fonts, which Dragon fences today: only Inter VF at its default instance);
San Francisco's optical size chosen by point size and its size-dependent tracking (`trak`), as CoreText applies them, proven
against CoreText; a check at run time that the device's file is the one measured (the hosts draw Dragon's glyph ids, which
are only right for that file); the licence question for reading San Francisco at build time (Apple's licence, not an
engineering call); and a web column for the comparison: Chrome draws `system-ui` as San Francisco on a Mac, but Dragon's
Linux reference Chrome has neither font.

User settings that change text size at run time whatever the font: iOS Dynamic Type (Larger Text, 12 sizes, and per-app
Text Size in Control Center), Bold Text, Display Zoom (changes the screen width in points); Android font scale (Font size,
nonlinear above 1.0 since API 34), Display size (changes dp per pixel, so the width in dp), Bold text (font weight adjustment,
API 31+). The web's equivalents: the browser's default font size (changes `medium` and `rem`, not `px`), page zoom (scales
CSS px, so the viewport narrows in CSS px), minimum font size; iOS Safari's per-site text size (aA) and Dynamic Type only for
`-apple-system-body` fonts; Chrome on Android's text scaling, which follows the system font size.

## Found on the way, not on this list

- **The dark-mode page base.** Chrome 145, with the dark preference emulated as the comparison and the web column emulate
  it, paints a page with no background over rgb(18, 18, 18), not white, whatever its `color-scheme`. The hosts paint white
  there, as rung S5 decided. Which one should an app author see on a phone in dark mode? Until decided, a see-through page
  background in a dark band is refused by name.
- **Text that changes to an unbounded value** (`Sent {count}`) is still laid out at its first string, so a longer string can be
  cut off on a phone. Text over a cell with known values (a boolean, or tabs' selected value) now gets one string per state.
  The unbounded case needs on-device text layout (the same engine as width `@media`) or Dragon's format templates (T068).
