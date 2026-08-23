# qr-code — implementation notes

The family follows `goals/headless-components/notes/research-qr-code.md`. What is
recorded here is only what the source cannot show: where the design departed from
the research note, and the framework limits this family ran into, each one
measured on this branch rather than assumed.

## Shape

The QDS folder's exact part list, five parts: `root`, `frame`, `patternsvg`,
`patternpath`, `overlay`. Each renders one element and nothing else. There is no
gesture, no keyboard model, no focus, no ordering and no registration — the whole
family is a pure function of a string, rendered as one `<svg>` holding one
`<path>` of 1x1 squares, with the `viewBox` sized to the module count so scaling
is CSS.

Deliberate departures from the QDS reference, each named in the research note:

- **No default `aria-label`** (note §2, defect 1). QDS names the code
  `` `QR code for ${value}` ``, which for this family's most common real use —
  two-factor setup — reads a TOTP secret aloud. The consumer names it, and
  `unnamed.tsrx` exists so the suite can assert the absence rather than let a
  value-leaking default creep back.
- **The encoding follows the props** (defect 2). `path` and `viewBox` are
  `computed()` over the seeded `value` and `recovery`, not a task over a copied
  signal, so a rotated pairing code re-encodes. `pairing.tsrx` is that row.
- **`{...rest}` first on every part**, including `frame` (defect 4), with
  `spread-first.tsrx` writing the three colliding props a consumer might pass.
- **`recovery` defaults to `medium`**, spelled in words rather than as the
  standard's `L`/`M`/`Q`/`H` (defect 5). QDS defaults to `low` while also
  shipping an `overlay` part; a logo over a `low` code does not scan.
- **`value` is required.** QDS defaults it to `""`, which encodes an empty string
  into a valid, scannable, useless code.

No part carries a `ui-*` attribute. There is no state to reflect, and the suite
asserts that absence so it does not read as an oversight.

## The encoder is written here, and why

The research note (§1, §5) found `uqr` to be the encoder every other
implementation uses. It is not a dependency of this repo, and the unit packet
forbids adding one without asking first, so `qr-encode.ts` implements
ISO/IEC 18004 directly: UTF-8 byte mode, smallest fitting version 1-40,
Reed-Solomon over GF(256), the standard interleave, all eight masks scored by the
specification's four penalty rules. Roughly 450 lines and no runtime dependency.

**It was verified against `uqr` rather than trusted.** `uqr` was installed
outside the repo (nothing was added to `package.json` or the lockfile) and every
matrix compared cell by cell: **5,185 cases matched byte for byte** — payload
lengths 1 to 1,300 at all four recovery levels, spanning versions 1 to 40, plus
non-ASCII and emoji input through the UTF-8 path. Two real bugs were found and
fixed this way, and neither would have shown up in a rendering test:

1. The high-recovery block-count table was wrong from version 32 up (it had a
   value dropped and everything after it shifted), so the largest codes at
   `recovery="high"` were refused or mis-sized. Byte capacity at version 40 came
   out 1,153 instead of 1,273.
2. Nothing else. Low, medium and quartile matched on every length on the first
   run.

**The one honest gap:** byte mode only. A purely numeric or purely alphanumeric
string fits a smaller symbol in its own mode, and `uqr` picks those modes, so for
`"HELLO WORLD"` the two encoders produce different (both valid) codes of the same
size. Byte mode is correct for every input, just not the tightest possible code
for those two. Adding the modes is additive and needs no API change.

**Not measured: whether the encoder stays out of the client bundle.** The
research note (§7, §9) calls this a gating row, and it belongs in
`packages/bundler/test/`, which is outside this unit's file contract. It is not
done and nothing here should be read as evidence about it.

## Framework limits this family ran into

1. **A prop the part destructured out of its parameters still reaches the
   element through `{...rest}`.** `QrCodeRoot` is written
   `({ value, recovery = 'medium', children, ...rest })` and renders
   `<div {...rest} role="img">`, and the served element comes back as

   ```html
   <div data-testid="root"
        value="otpauth://totp/Acme:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme"
        recovery="quartile" aria-label="…" role="img">
   ```

   in both CSR and SSR. `value` and `recovery` are not in `rest` in the authored
   source, so the spread lowering is not subtracting the destructured names.

   **This is not specific to this family** — every family here destructures its
   own props the same way, so `collapsible.root` leaks `open`/`disabled` and
   `progress.root` leaks `value`/`min`/`max` by the same route. It surfaces here
   because this is the one family where the leaked prop is the secret: dropping
   QDS's value-derived accessible name is pointless if the value is sitting on
   the element as an attribute anyway.

   Two rows are pinned `test.fails` on it at the bottom of `qr-code.browser.ts`;
   whoever lands the spread subtraction deletes the `.fails`.

2. **An imported identifier used only inside a template literal is dropped from
   a computed's emitted imports.** `computed(() => \`0 0 ${qrSize(v, r)}\`)`
   fails at render with `ReferenceError: qrSize is not defined`.

   The cause is exact: `referencedModuleImports`
   (`packages/compiler/src/passes/symbol-resolver.ts`) decides which module
   imports an emitted symbol needs by searching the source text, and it first
   blanks string and comment text with `sourceWithoutStringOrCommentText`. That
   function treats a backtick as an ordinary quote, so a whole template literal
   is blanked — interpolations included — and any identifier that appears only
   inside a `${…}` is never seen. The same call written outside a template is
   collected correctly.

   Not pinned as a row, because the family has no reason to author the defective
   shape: `qrViewBox()` builds the string in plain TypeScript and the computed
   is a plain call. Recorded here with the exact site so the next family that
   hits it does not re-diagnose it.

3. **A composite template-literal attribute over a computed did not resolve on
   the SSR path.** `viewBox={\`0 0 ${qr.size} ${qr.size}\`}` rendered as
   `0 0 undefined undefined` under `renderSSR` while the same markup was correct
   under `render`. Measured once, on the way to the shape the family ships
   (a single `viewBox` computed), and not investigated further — so treat it as
   a sighting to reproduce rather than a diagnosis.

## Test plan, and what is not covered

`qr-code.browser.ts` carries the research note's rows: the pure-function rows
(size, determinism, single-module path, empty path, recovery ordering, UTF-8
bytes, over-capacity refusal) run as plain assertions in the same file rather
than a separate unit file, so the packet's one verify command actually runs them.
The rendered rows run once per mode through the `MODES` loop, with literal
`render`/`renderSSR` call sites.

Not covered, and why: **whether a rendered code actually scans.** That needs a
decoder, and no decoder is available here. The determinism and geometry rows plus
the cell-for-cell agreement with `uqr` are the closest available evidence, and
they are evidence about the encoder rather than about a camera.
