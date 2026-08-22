# QR Code — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/qr-code/` (READ-ONLY)
**Markless facts read from:** this worktree, cut from `feat/headless-ui-pilot` @ `30c5f92f`.
Framework-limit statements are quoted from `packages/headless/components/src/checklist/note.md`.

**The frame, stated first.** A QR code is a **pure function of a string**. There is no state, no
gesture, no keyboard model, no focus, and no ARIA beyond naming an image. Rendered on the server it
is finished HTML: an `<svg>` with one `<path>`, correct forever, with the JavaScript bundle never
loading. That makes it the cheapest family in the package and the best possible demonstration of
what this framework is for — and it moves the whole design question from *behaviour* to **where the
encoder runs and what it costs in bytes**.

**Cluster note.** One of four documents for tranche 5 (otp, pagination, scroll-area, qr-code). The
consolidated framework asks are in `research-pagination.md` §8; this family asks for nothing (§8).

---

## 1. Name and alternates

Searched under: qr code, qrcode, QR, 2D barcode, matrix barcode, barcode, data matrix, scan code,
pairing code.

- **QR Code** is the settled name in the two headless libraries that ship it: QDS `qr-code`, Ark UI
  `QrCode`. There is no competing name.
- **Barcode / Data Matrix are different symbologies**, not other names for this one. Nothing in this
  family generalises to them: Code128 and Data Matrix have different encoders, different error
  correction, and different geometry. If a consumer needs those, they need a different family and
  probably a different package. Worth one line in docs.
- **"QR Code" is a registered trademark of Denso Wave**, which permits use of the term for
  conforming implementations under the ISO/IEC 18004 standard. Not a blocker — every library ships
  under the name — but it is the kind of fact that belongs in a research note rather than being
  rediscovered at legal review.
- **Alternative-named implementations worth crediting:**
  - **`uqr`** is the encoder the ecosystem converged on, and it is the finding that decides §7. It is
    used by **zag-js** (`packages/machines/qr-code/src/qr-code.machine.ts` imports `encode` from
    `uqr`, and its types re-export `QrCodeGenerateOptions`/`QrCodeGenerateResult` from `uqr`),
    therefore by **Ark UI**, and independently by **QDS**, `better-auth-ui`, `dotUI`, Excalidraw and
    others (§5). Two of the three headless implementations of this family are the same encoder with
    different markup around it.
  - **`renderSVG` / `renderANSI` from the same package.** Excalidraw uses `renderSVG` to produce a
    complete SVG string; `kanna` uses `renderANSI` to print a scannable QR **in a terminal**. Both
    are evidence the encoder is genuinely runtime-agnostic, which matters for SSR (§7).

**Recommendation: keep the QDS name `qr-code`.**

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
qr-code-root.tsx   qr-code-frame.tsx   qr-code-pattern-svg.tsx
qr-code-pattern-path.tsx   qr-code-overlay.tsx
qr-code-context.ts   index.ts   metadata.json   qr-code.css   qr-code.browser.tsx
```

`index.ts`:

```ts
export { QRCodeRoot as root }               from "./qr-code-root";
export { QRCodeFrame as frame }             from "./qr-code-frame";
export { QRCodePatternSvg as patternsvg }   from "./qr-code-pattern-svg";
export { QRCodePatternPath as patternpath } from "./qr-code-pattern-path";
export { QRCodeOverlay as overlay }         from "./qr-code-overlay";
```

**Five parts: root, frame, patternsvg, patternpath, overlay.** Note that Ark UI collapses
`patternsvg` + `patternpath` into one `Pattern` part; QDS splits them so the `<svg>` and the `<path>`
are separately styleable and separately spreadable. Keeping the split costs nothing and follows the
folder.

### What QDS actually implements

| Concern | QDS behaviour |
| --- | --- |
| Encoder | `import { encode } from "uqr"` — an external dependency, **not a QDS-written encoder** |
| Root props | `value?: string`, `level?: 'L' \| 'M' \| 'Q' \| 'H'` (default `'L'`) |
| Encoding | a task tracking the internal `value`/`level` signals calls `encode(value, { ecc: level, border: 0 })` and stores `qrResult.data` — a `boolean[][]` |
| Root element | `<div role="img" aria-label={props['aria-label'] ?? \`QR code for ${value}\`}>` |
| `patternsvg` | `<svg viewBox={\`0 0 ${size} ${size}\`} aria-hidden="true">` where `size = data.length` |
| `patternpath` | one `<path>` whose `d` is built by reducing the matrix: `M ${x} ${y} h 1 v 1 h -1 z` per dark module |
| `frame` / `overlay` | plain `<div>`s with an identity attribute and no state whatsoever |

The core is right and worth stating plainly: **one `<svg>`, one `<path>`, integer coordinates, a
`viewBox` sized to the module count.** Scaling is CSS. There is no canvas, no image, no data URI, no
per-module element. That is the correct rendering strategy and we should copy it exactly.

### Five things in QDS worth not copying — four of them are defects

1. **The default `aria-label` leaks the encoded value.** `` `QR code for ${value}` `` announces the
   whole string. For a pairing URL that is a long unreadable token; for the family's single most
   common real use — two-factor setup — the value is an `otpauth://totp/...?secret=JBSWY3DP...` URI,
   so **a screen reader reads the TOTP secret aloud**. It is also untranslatable. The name should
   describe the *purpose* ("Scan to sign in"), which only the consumer knows, so the consumer must
   supply it (§7).
2. **The code does not follow its own `value` prop.** `qr-code-root.tsx:22-23` does
   `useSignal(props.value || "")` and the encoding task tracks *the signal*, not the prop. A parent
   changing `value` after mount re-renders the component but never re-encodes: the displayed QR is
   the one from first render. Same for `level`. For a rotating pairing code — the second most common
   use — the widget is silently wrong.
3. **`border: 0` removes the quiet zone.** ISO/IEC 18004 specifies a 4-module light margin around
   the symbol, and scanners genuinely need it. QDS emits a symbol with no margin and leaves the
   margin to CSS padding on `qr-code.frame`. That is a defensible *design* (the padding must be the
   light colour, which is a styling decision) but it is a scanning failure waiting for a consumer who
   puts the QR on a dark background with no padding. It belongs in the docs as a requirement, not as
   an implementation detail nobody mentions.
4. **`frame` spreads props last**: `<div ui-qds-qr-code-frame {...props}>`. A consumer prop overwrites
   the identity attribute. Our `{...rest}`-first rule fixes it; `overlay`, `patternsvg` and
   `patternpath` already spread first.
5. **`level` defaults to `'L'`** (7% recovery). Every other implementation surveyed defaults to `'M'`
   (15%), which is the ISO default and the right trade for a code that will be printed, photographed
   at an angle, or covered by an `overlay` logo. And `overlay` is a QDS part — **a logo in the middle
   of an `ecc: 'L'` code will not scan.** The default and the part actively contradict each other.

### The mechanism that has no Markless equivalent

None. There is no context getter, no registration, no ordering, no index. `qr-code-context.ts`
carries three signals (`value`, `level`, `data`) and nothing else. This is the simplest family in the
QDS reference.

---

## 3. Headless library survey

| Library | Has it? | Parts | Encoder | Verified |
| --- | --- | --- | --- | --- |
| **Ark UI** (zag `qr-code`) | yes | `Root`, `Frame` (svg), `Pattern` (svg path), `Overlay` (div), `DownloadTrigger` (button) | **`uqr`** — `encode` imported in `qr-code.machine.ts`; `QrCodeGenerateOptions`/`QrCodeGenerateResult` re-exported from `uqr` in `qr-code.types.ts` | anatomy and props fetched from `ark-ui.com/react/docs/components/qr-code`, encoder verified by grep on the zag source, both 2026-08-22 |
| **Base UI** | **no** | — | — | fetched `base-ui.com/llms.txt`, 2026-08-22 — the 47-component index has no QR Code |
| **QDS** | yes | `root`, `frame`, `patternsvg`, `patternpath`, `overlay` | **`uqr`** | source read 2026-08-22 |
| **Radix UI / React Aria / Kobalte / Bits UI / Melt UI / Ariakit / Corvu / Headless UI** | **not verified**; none is expected to ship it, since a QR code has no interaction model | — | — | not fetched this session — do not cite this row as an absence claim |
| **dotUI** | yes (registry component, three visual variants: squares, dots, rounded) | one component | **`uqr`** | grep, 2026-08-22 |
| **better-auth-ui** | yes (a `qr-code.ts` helper returning `{ path, size }`) | none — a function | **`uqr`** | grep, 2026-08-22 |

Consensus, and where QDS sits:

- **The anatomy is nearly identical between the only two headless implementations.** QDS
  `root/frame/patternsvg/patternpath/overlay` vs Ark UI `Root/Frame/Pattern/Overlay/DownloadTrigger`.
  The only differences are QDS's svg/path split and Ark UI's download trigger.
- **`uqr` is the encoder in every implementation found.** Not a coincidence: it is dependency-free,
  runtime-agnostic (it renders to SVG, to ANSI for a terminal, and to a boolean matrix), and small.
  Writing our own encoder would be re-implementing ISO/IEC 18004 for no gain.
- **Ark UI's props are `value`, `defaultValue`, `encoding` (the whole `QrCodeGenerateOptions` object)
  and `pixelSize`.** Passing the encoder's option bag straight through is a real API choice: it
  exposes the dependency's type in our public surface (§7 argues against it), but it never has to
  grow a prop for a feature `uqr` already has.
- **Ark UI's `DownloadTrigger`** produces a data URL from the rendered element and downloads it.
  It is the one interactive thing in the family, it needs canvas rasterisation, and QDS has no
  equivalent. Out of scope for v1 (§10).
- **Nobody documents ARIA except QDS.** Ark UI's API reference lists no accessibility attributes at
  all, which means its `Root` is a bare `<div>` — no `role="img"`, no name. **QDS is the more correct
  of the two here**, defect 1 notwithstanding.

---

## 4. Specifications and expert commentary

### There is no APG pattern, because this is an image

`w3.org/WAI/ARIA/apg/patterns/` has no QR-code pattern and never will. The relevant specification is
the ARIA `img` role plus WCAG 1.1.1 (Non-text Content): a non-text element that conveys information
needs a text alternative that serves the equivalent purpose.

### aria-at coverage: none

No plan for `img`, for graphics, or for QR codes among the 40 folders under `w3c/aria-at/tests/apg`
(full list in `research-otp.md` §4, read 2026-08-22).

### What the specs and practice do fix

- **`role="img"` on the container**, with the `<svg>` inside `aria-hidden="true"`. This is the
  standard, well-established way to expose an inline SVG as a single image and to stop assistive
  technology walking into hundreds of path segments. QDS does exactly this and it is correct.
- **The accessible name must serve the equivalent purpose, not describe the pixels.** For a QR code
  the equivalent purpose is never the encoded string (§2, defect 1). "Scan to add this account to
  your authenticator app" is a text alternative; `otpauth://totp/Acme:me@example.com?secret=…` is a
  security leak read at 200 words per minute.
- **The strongest accessibility requirement in this family is not an attribute at all.** A QR code
  is *unscannable by the device displaying it* — a person reading it on their phone cannot point that
  phone's camera at itself. So the value must **also** be available in another form: the URL as a
  real link, the TOTP secret as selectable, copyable text. This is not our markup's job, but it is
  the single most important thing our documentation says, and every 2FA setup screen that gets it
  right does it (a "can't scan it? enter this code manually" affordance next to the QR).
- **The quiet zone is a scanning requirement, not a style** (§2, defect 3).
- **Contrast:** a QR needs high contrast between modules and background, and inverting it (light
  modules on dark) breaks many scanners, which expect dark-on-light. A designer will ask; the answer
  is "dark modules on a light background, with margin". Worth one docs line.

### Expert commentary

No post by Roselli, O'Hara, Higley, Pickering, Soueidan, Head, Sutton or Romo specifically on QR
codes was located this session. Recording that as an absence rather than filling it. The adjacent,
uncontroversial principle that applies is the SVG-as-image one above: a decorative inner graphic gets
`aria-hidden`, and the container carries the role and the name.

---

## 5. GitHub patterns (grep MCP)

Searches run: `from "uqr"` (TypeScript/TSX). Findings:

- **`uqr` is the ecosystem's QR encoder, and the sample shows why.** Hits span a state-machine
  library (zag's `qr-code.machine.ts` and `qr-code.types.ts`), an auth UI kit
  (`better-auth-ui/packages/core/src/lib/qr-code.ts`, whose doc comment reads "A path composed only
  from the encoded QR module coordinates" — the same one-path strategy as QDS), a component registry
  (dotUI, three variants over the same `encode`), a whiteboard app (Excalidraw's
  `share/qrcode.chunk.ts` using `renderSVG`), and a CLI (`kanna` using `renderANSI` to print a QR in
  a terminal, plus `renderSVG` in its web UI).
- **The one-`<path>`-of-1×1-squares strategy is the convergent answer**, not a QDS invention:
  better-auth-ui's helper returns exactly `{ path, size }`. Anyone doing this seriously ends up
  emitting one path and letting the `viewBox` do the scaling.
- **Excalidraw imports it as a lazily-loaded chunk** (`qrcode.chunk.ts`). That naming is a byte
  decision made visible: even a small encoder is worth keeping off the initial bundle when the QR is
  behind a share dialog. It is the same question §7 raises for us, answered by a different framework.
- **The renderer/encoder split is real.** `encode()` returns a matrix; `renderSVG()` returns a
  string. A framework that renders its own markup wants the first; a framework that wants a black box
  wants the second. We want the first, for the same reason QDS and zag do: the parts have to be
  separately styleable.

---

## 6. Expected screen-reader behaviour

No aria-at plan exists (§4); derived from semantics, and testable as accessibility-tree assertions.

**Sequence A — Browse-mode traversal onto the QR**
1. reader's next-item command
2. → the consumer's name ("Scan to sign in")
3. → "image" / "graphic"

One announcement, one object. Not "group", not a hundred path segments, and **not the encoded
string** — which is the row that catches defect 1.

**Sequence B — Traversal into the SVG**
1. reader's next-item command with the QR focused
2. → the **next content after the QR**

Nothing inside is reachable, because `patternsvg` is `aria-hidden="true"`. Without it, some
reader/browser combinations expose the `<svg>` as a separate graphic and a few expose `<path>`
elements, producing a nested announcement inside an image.

**Sequence C — An `overlay` with a logo inside the QR**
1. reader's next-item command
2. → the overlay's own content is announced **if the consumer put content there**

This is the one place our markup can go wrong in a way the consumer cannot see: `overlay` sits inside
`root`, and `root` is `role="img"`. **An element with `role="img"` is a leaf in the accessibility
tree** — its descendants are presentational — so anything the consumer puts in `overlay` (a nested
`<img alt="Acme">`, a link) is *not* announced. That is correct for a decorative logo and wrong for
anything meaningful, and it is a real docs line: put nothing informative inside a QR code.

**Sequence D — The value in another form**
Not our markup at all: the consumer's link or copyable secret next to the QR (§4). Our scenarios
should show it so nobody ships a QR-only screen.

**Where readers differ.** How an SVG-in-`role="img"` is announced varies a little between
VoiceOver ("image") and NVDA/JAWS ("graphic"), and older combinations sometimes announce nothing when
the name is empty. That last one is the reason our name must be *required* rather than defaulted to
something useless.

---

## 7. Markless API design

### Parts

`qrcode.root`, `qrcode.frame`, `qrcode.patternsvg`, `qrcode.patternpath`, `qrcode.overlay` — the QDS
folder listing exactly.

The namespace spelling needs one ruling: QDS's folder is `qr-code` and its export name would be
`qr-code`, which is not a valid identifier for `export * as`. QDS's own attributes are inconsistent
about it (`ui-qds-qr-code-root` and `ui-qds-qr-code-frame`, but `ui-qds-qr-pattern-svg` and
`ui-qds-qr-overlay`). Recommend the namespace `qrcode` with the folder `qr-code`, and say so in the
parity table (§10.1).

Not added: `DownloadTrigger` (Ark UI's; §10.5), and no separate ellipsis-style helper — there is
nothing else in this family.

### Where the encoder runs, which is the family's only real design question

`uqr`'s `encode()` is a pure function: same string in, same matrix out, no DOM, no timers, no
platform APIs — proven by `kanna` running it in a terminal (§5). That means the path string is a
**`computed()` over `value` and `level`**, and everything else follows:

- **When `value` is a static prop**, the computed resolves at render, the server emits the finished
  `<path d="…">`, and the page is complete with no client work. This is the family's whole pitch.
- **When `value` changes** (a rotating pairing code, a URL built from state), the computed re-derives
  and the `d` attribute updates — the one thing QDS gets wrong (§2, defect 2) and we get right for
  free, because a computed over a seeded prop is the shape this branch has been landing for three
  tranches (`checklist/note.md`, "What T075g changed").

**The byte question is real and this document does not pretend to answer it.** `uqr`'s encoder is
a few kilobytes and it must be present wherever the render runs. On a server-rendered page with a
static value it should never reach the browser; whether this branch's precompute path actually keeps
it out is **a measurement, not an assumption**, and it belongs in the implementation unit as a
byte-wall row (`packages/bundler/test/music-player-ssr-budget.test.ts` is the existing shape). §10.3
puts the fallback in front of the owner: if the encoder does reach the client bundle on an
SSR-only page, the honest v1 accepts a `data` prop (a `boolean[][]` the consumer encodes wherever
they like) alongside `value`, which is how a consumer would shed the dependency entirely.

### Types (`qr-code-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type QrCodeRootProps = PropsOf<'div'> & {
	/** The text the code carries — usually a URL. */
	readonly value: string;
	/**
	 * How much of the code can be damaged or covered and still scan:
	 * "low" 7%, "medium" 15%, "quartile" 25%, "high" 30%.
	 * Use "quartile" or "high" when a logo sits on top of the code.
	 */
	readonly recovery?: 'low' | 'medium' | 'quartile' | 'high';
};

export type QrCodeFrameProps = PropsOf<'div'>;
export type QrCodePatternSvgProps = PropsOf<'svg'>;
export type QrCodePatternPathProps = PropsOf<'path'>;
export type QrCodeOverlayProps = PropsOf<'div'>;

export type QrCodeInstanceState = Seeded<QrCodeRootProps, 'value' | 'recovery'>;
```

Notes on the shape:

- **`value` is required.** QDS makes it optional and defaults to `""`, which encodes an empty string
  into a valid, scannable, useless QR code. A QR code with no value is a bug, not a state.
- **`recovery` replaces `level`, spelled in words, defaulting to `'medium'`.** `'L' | 'M' | 'Q' | 'H'`
  are the standard's letters and mean nothing to a reader; our conventions prefer the plain-language
  surface. The default moves from QDS's `'L'` to `'M'` — the ISO default, every other
  implementation's default, and the only one compatible with shipping an `overlay` part (§2,
  defect 5).
- **No `encoding` option bag** (Ark UI's). Passing `uqr`'s `QrCodeGenerateOptions` through would put
  a dependency's type in our public API and make the dependency unswappable. If a consumer needs
  masking or version pinning, that is a later prop with our own name.
- **No `pixelSize`** (Ark UI's). The `viewBox` is the module count and the rendered size is CSS —
  `width`/`height` on `qrcode.patternsvg`, which arrives through `{...rest}`.
- **No `aria-label` prop.** It arrives through `{...rest}` like any attribute. What changes is that
  we supply **no default** (§2, defect 1).

### Instance and parts

```tsx
export const qrCodeState = shared(
	() => {
		const qr: QrCodeInstanceState = state({
			value: '',
			recovery: 'medium' as const,
		});

		return {
			...qr,
			// pure, deterministic, and therefore resolvable at render on either side
			modules: computed((): boolean[][] => encodeModules(qr.value, qr.recovery)),
			size: computed((): number => encodeModules(qr.value, qr.recovery).length),
			path: computed((): string => modulesToPath(encodeModules(qr.value, qr.recovery))),
		};
	},
	{ scope: 'widget' },
);

export function QrCodeRoot({ value, recovery = 'medium', children, ...rest }: QrCodeRootProps) @{
	const qr = qrCodeState();
	qr.value = value;
	qr.recovery = recovery;

	<div {...rest} role="img">{children}</div>
}

export function QrCodeFrame({ children, ...rest }: QrCodeFrameProps) @{
	<div {...rest}>{children}</div>
}

export function QrCodePatternSvg({ children, ...rest }: QrCodePatternSvgProps) @{
	const qr = qrCodeState();

	<svg {...rest} viewBox={`0 0 ${qr.size} ${qr.size}`} aria-hidden="true">{children}</svg>
}

export function QrCodePatternPath({ ...rest }: QrCodePatternPathProps) @{
	const qr = qrCodeState();

	<path {...rest} d={qr.path} />
}

export function QrCodeOverlay({ children, ...rest }: QrCodeOverlayProps) @{
	<div {...rest}>{children}</div>
}
```

Deliberate differences from QDS, each with its reason:

- **No default `aria-label`** (§2, defect 1). The root sets `role="img"` and nothing else; the
  consumer names it. An unnamed `role="img"` is a real failure, so this should eventually be a
  compiler-level or lint-level nudge — recorded as a want, **not proposed as an API** (§8).
- **The encoding follows the props** (§2, defect 2), because it is a computed over seeded cells
  rather than a task over an initialised signal.
- **`{...rest}` first on `frame`** (§2, defect 4).
- **`recovery` defaults to medium** (§2, defect 5).
- **The quiet zone stays a CSS/docs concern**, matching QDS's `border: 0`, but the docs state it as a
  scanning requirement: `qrcode.frame` needs light-coloured padding of roughly four modules
  (§10.4 offers the alternative of encoding the border into the matrix).
- **No `ui-*` state attributes anywhere.** There is no state to reflect. A family with no
  `ui-` attribute is a legitimate outcome and worth noting in the parity table so its absence does
  not read as an oversight.

### What is not expressible today

| Wanted | Status |
| --- | --- |
| Refusing at build time when `qrcode.root` has no accessible name | no such diagnostic exists and this document does not propose one (§8). A test row and a docs line are the v1 answer |
| A download trigger | needs canvas rasterisation and a programmatic download; out of scope (§10.5) |
| A consumer `el` handle spread onto `patternsvg` reaching the graph | `checklist/note.md` limit 1 — the spread reaches the element, not the graph |

### SSR and resume

This is the strongest SSR story in the package, and the suite should say so out loud:

- with a static `value`, the served HTML contains the finished `<path>` and **nothing needs to
  resume**;
- with a bound `value`, the served HTML contains the correct first `<path>`, and the first write
  after resume re-derives it — the plain computed-over-a-seeded-prop path;
- there is no gesture, so there is no wake set, no event replay, and no first-dispatch cost.

---

## 8. What this family needs from the framework

**Nothing.** No new capability, no new diagnostic, no new authoring surface, no ordering, no index,
no IDREF set, no callback slot, no repeat, no listener of any kind.

It contributes three things to the cluster memo (`research-pagination.md` §8) instead:

1. **It is the control for tranche 5**, the way collapsible was for tranche 4. If a qr-code row is
   red, the defect is in computed-over-seeded-prop rendering or in SSR emission, not in anything this
   family invented. Land it first.
2. **It prices the "pure function in a computed" path with a real dependency.** Everything else in
   the package computes over its own state; this computes over an imported encoder. Whether that
   encoder stays out of the browser bundle on an SSR-only page is a **measurement this family should
   take** (§7), and the answer is useful to every future family that wants to call a library at
   render time — a date formatter, a markdown renderer, a syntax highlighter.
3. **It is the one family where a missing attribute is silently catastrophic.** `role="img"` with no
   name is announced as an unlabelled graphic or as nothing at all, and there is no visual symptom.
   That is an argument for a *name-required* diagnostic somewhere in the package's future — recorded
   here as a want with its evidence, and explicitly **not** proposed as an API, per the packet's
   constraint. If the owner wants it chartered, this is the family that motivates it.

---

## 9. Test plan

`packages/headless/components/src/qr-code/qr-code.browser.ts`, plus a plain unit file
`qr-code-path.test.ts` for the matrix-to-path function. Scenarios under `src/qr-code/scenarios/`.
Part-role testids: `root`, `frame`, `patternsvg`, `patternpath`, `overlay`.

Unit rows for the pure functions:

| Input | Expected |
| --- | --- |
| a known short string at `recovery: 'medium'` | a matrix whose side length is one of the standard versions (21, 25, 29, …) and is odd |
| the same string twice | byte-identical path strings — determinism, which is what makes SSR safe |
| a matrix with one dark module at (0,0) | `d` is exactly `M 0 0 h 1 v 1 h -1 z ` |
| an all-light matrix | `d` is the empty string, and the `<path>` still renders (not `undefined`) |
| the same string at `'low'` vs `'high'` | different matrices, and `'high'` is the same size or larger |

Browser scenarios, starter first:

1. `basic.tsrx` — root with a URL, a frame, a pattern svg and path, and an `aria-label`.
2. `two-factor-setup.tsrx` — the realistic one, and the one that teaches: an `otpauth://` value,
   `recovery="quartile"`, an `overlay` with a logo, a purpose-describing `aria-label`, **and the
   secret rendered as selectable text beside the QR** (§4). This scenario is a documentation artefact
   as much as a test.
3. `pairing.tsrx` — `value` bound to state, with a button that rotates it. The row QDS fails
   (§2, defect 2).
4. `no-overlay.tsrx` — the plain code at the default `recovery`.
5. `two-codes.tsrx` — two QR codes with different values on one page.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| the root carries `role="img"` | the family's one ARIA fact |
| the root carries **no** `aria-label` unless the consumer wrote one | the deliberate deviation from QDS (§2, defect 1); assert the absence so nobody re-adds the value-leaking default |
| a consumer `aria-label` on the root reaches the element | the naming path |
| the encoded value does **not** appear in any attribute or text node of the rendered output | the security-shaped version of the same row: assert the `otpauth://` secret from scenario 2 is nowhere in the DOM outside the path geometry |
| `patternsvg` carries `aria-hidden="true"` | stops readers walking into the graphic (§6, sequence B) |
| the accessibility tree under the root is a single image node with no children | the same point as a property |
| the `<path>`'s `d` is non-empty and its `viewBox` is `0 0 N N` with `N` matching the matrix side | the rendering contract |
| changing `value` changes the `d` attribute | QDS defect 2; the single most valuable row in the family |
| changing `recovery` changes the `d` attribute | the same defect on the other prop |
| `{...rest}` cannot overwrite `role`, `d`, or `viewBox` | spread-first convention, and QDS's `frame` violates it |
| two co-rendered codes render **different** paths | widget-instance isolation on a family with no gestures — the cheapest possible isolation row |
| **SSR: the served HTML already contains the finished `<path d="…">`**, byte-identical to the CSR render | the family's entire pitch, asserted rather than claimed |
| SSR + resume: nothing changes on resume for a static value; for a bound value the first write re-derives `d` | the two halves of the resume story |
| **byte measurement: the encoder does not appear in the client bundle for an SSR page with a static value** | §7 and §8.2; if this comes back red it changes the API (§10.3), so it is a gating row, not a nice-to-have |

Mode loop: shared rows run once per mode with a literal `render`/`renderSSR` call site each.

**Not tested, and why:** whether the rendered code actually *scans* cannot be asserted in the browser
suite — that needs a decoder. The unit rows above pin determinism and geometry, and a decode check
against a known-good fixture matrix would be the honest addition if `uqr` (or another package) ships
a decoder; recorded as a gap in the parity table rather than implied.

---

## 10. Open questions

1. **Namespace spelling `qrcode` for the folder `qr-code`.** Recommended: `qrcode`, because
   `export * as qr-code` is not valid. Trivial, but it is a public name and QDS's own attributes are
   already inconsistent about it (§7).
2. **Dropping the default `aria-label` and requiring the consumer to name the code.** Recommended:
   drop, with an assert-it-is-absent row. This is the most consequential decision in the document:
   it is a knowing parity break, it makes an unnamed QR code possible (worse than QDS's useless
   name, in one narrow sense), and it stops us reading a TOTP secret aloud. §8.3 records the
   name-required diagnostic as a want the owner may want chartered separately.
3. **What happens if the encoder reaches the client bundle.** Recommended: measure first (§9's
   gating row), and only if it does, add a `data` escape hatch that takes a pre-encoded
   `boolean[][]` so a consumer can shed the dependency. **This is a contingent API and should not be
   built speculatively** — it is here so the owner is not surprised by a byte-wall red during
   implementation.
4. **Quiet zone: CSS padding (QDS) or four encoded border modules.** Recommended: CSS padding,
   matching QDS, **plus a docs requirement**. The alternative — `border: 4` in the encode options —
   guarantees scannability regardless of styling but bakes a margin into the `viewBox`, so a
   consumer's `background` behind the frame no longer shows through the margin. Worth the owner's
   ruling because it is the difference between "scans by default" and "scans if you read the docs".
5. **`recovery` defaulting to medium, and the `overlay` interaction.** Recommended: medium, against
   QDS's low. Also recommend the docs say plainly that an `overlay` needs `quartile` or `high` —
   a logo over a `low` code does not scan, and QDS ships both the low default and the overlay part
   with no warning.
6. **A download trigger.** Recommended: not in v1. It is Ark UI's one extra part, it needs canvas
   rasterisation and a programmatic download, and it is the only thing in this family that would
   require client JavaScript on a page that otherwise needs none — which is exactly the property
   worth protecting.
