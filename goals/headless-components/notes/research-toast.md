# Toast — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference:** **there is no `toast` folder in QDS**, and no notification, snackbar or alert
family either. The full list under `~/dev/open-source/qwik-design-system/libs/components/src/` is:
button, calendar, carousel, checkbox, checklist, collapsible, date-input, file-upload, label, menu,
modal, navbar, otp, pagination, popover, progress, qr-code, radio-group, render, resizable,
scroll-area, select, slider, table, tabs, textbox, toggle, tree, visually-hidden. §2 records what
exists instead, per the packet's blocked-permission clause.
**Markless facts read from:** the shared checkout on `feat/headless-ui-pilot` (session snapshot head
`7c87ecf5`), plus first-hand reads of `packages/core/src/framework-api.ts` and
`specs/framework/03-state-graph.md` in this worktree.

**Cluster note.** The shared overlay-primitive requirements memo is in `research-popover.md` §7.
Toast's contribution is §8 below. Toast is **the only family in this cluster with no QDS precedent,
no meaningful aria-at coverage, and a genuine framework blocker**, and this document is written to
make all three visible rather than to make the family look ready.

---

## Re-anchored 2026-08-23

Under the stale-measurements doctrine, three findings below are **anchors, not facts**. They were
measured on 2026-08-22 and re-measured on 2026-08-23, when
`markless-component-research-toaster.md` went back over the same ground under a different charter
(Sonner-grade UX, a unified manager) and overturned them. **The original wording is left in place as
history**; each of the three sites carries a pointer back here.

Verified first-hand on `feat/headless-ui-pilot` at `d6e6725b`, by reading each cited file in a
checkout of that tip rather than carrying the toaster note's citations over.

| Where | What this note said (2026-08-22) | What holds on 2026-08-23 | Evidence |
| --- | --- | --- | --- |
| §7 "What is not expressible today", §8 point 1, §10 q3 | "no fixture anywhere combines widget parts with `@for`", so parts inside a keyed repeat are unproven, and toast must be gated on a spike and sequenced last | **Widget roots in a keyed `@for` render and each get their own instance** — four `rpt-*` fixtures do exactly that, one of them against the real `@markless/ui` checkbox family. The "no fixture anywhere" wording is stale and the spike is not owed. **The second half of the worry survives, and is now a measured red rather than an unknown** — see the caveat under this table. | `packages/vitest-browser/browser/fixtures/rpt-ui-page.tsrx`, `rpt-static-page.tsrx`, `rpt-reorder-page.tsrx`, `rpt-plain-child.tsrx` |
| §7 "The area" | The announcing live region should be a **hidden inner region**, separate from the visible stack | That shape breaks the moment a modal opens. The overlay pass descends into a subtree that holds a live region so the region survives, and **marks that subtree's siblings** — so a hidden inner region keeps announcing while the visible stack around it goes `inert` and `aria-hidden`. **The live region must be the toaster root itself.** | `packages/web/src/fns/overlay.ts:253-276` — `collectOutsideSubtrees` skips a child carrying `aria-live`, descends into one whose subtree holds a live region (`holdsLiveRegion`), and pushes every other child onto the marked list. Read in the toaster note §5.4 |
| §7 "The messages", §10 q4 | `toast.close` cannot work out which message it renders, so the message must be handed to every row part as a prop | **Solved and shipped: an item-level `shared()` seeded from the item's own props**, which every descendant part of that row resolves. Recommendation (a) is no longer the only honest option, and option (b) is no longer the "harder form" it was called. | `packages/headless/components/src/combobox/combobox.tsrx:122-129` (`comboboxItemState`), `packages/headless/components/src/radio-group/radio-group.tsrx:49-56` (`radiogroupItemState`) |

**The caveat that survives the first row, and it is the one toast actually needs.** §8 point 1 named
two unknowns: whether family parts may live inside a keyed repeat at all, and whether an array that
**grows** re-renders correctly. Only the first is retired. The second is now measured, and it is red:
`packages/headless/components/src/combobox/note.md:118-134` records that **a keyed repeat does not
follow its source when the rows root widgets** — measured twice, in CSR and SSR, with the source
both a `computed()` and a plain `state()` array. The array itself updates (the rendered
`matches.length` goes from `4` to `2`) while the `@for` keeps every row in the DOM. The combobox
note's own reading of why is the part that matters here: the landed repeat witnesses reorder rows
rather than change the list's length. `packages/headless/components/src/select/note.md:311-315`
records a related red row from the same ground (`CSR: options from a keyed loop each get their own
instance`), called there a keyed-repeat widget-instance defect.

**A toast queue is a runtime-growing array whose rows root parts, so this is the exact shape that is
red.** §10 q3 should therefore be read as narrowed, not answered: what it asks for is no longer a
spike into whether the combination is possible, but a named framework follow-up that the combobox
unit already filed as its own top priority. Toast still waits on it.

---

## 1. Name and alternates

Searched under: toast, snackbar, notification, notifications, alert, flash message, banner, growl,
status message, toaster, toast region.

- **Toast** is the settled library name: Base UI `Toast`, Radix `Toast`, Ark UI `Toast`/`createToaster`,
  React Aria `Toast`/`ToastRegion`/`ToastQueue`, Kobalte `Toast`, Sonner, react-hot-toast, shadcn's
  `use-toast`. The name comes from Android's `Toast` class.
- **Snackbar** is Material Design's name for the same thing; MUI ships `Snackbar`. Same component.
- **Alert** is the ARIA role (`role="alert"`) and the APG pattern name for the *announcement*
  mechanism, not for the component. A toast usually *contains* a status or an alert; it is not one.
  Confusing the two is the most common accessibility bug in the space (§4).
- **Banner / flash message** — a message rendered **in flow at the top of the page**, not floating and
  not auto-dismissing. Adrian Roselli's recommendation, if you cannot fix a toast, is literally to
  ship one of these instead. It needs no library.
- **Notification centre** — a persistent, reviewable list of past messages. Roselli recommends
  pairing it with toasts so nothing is lost. Not a family we would ship, but it is a sentence our
  docs should carry.
- **Alternative-named implementations** worth crediting:
  - **Sonner** (Emil Kowalski) is the de-facto styled default in the React ecosystem and the source
    of the stacking/expand-on-hover interaction everyone now copies. Not headless.
  - **`shadcn/ui`'s `use-toast`** is the most *copied* toast implementation in existence — grep finds
    near-identical clones in marimo, RAGFlow, cal.diy, cline (twice), chatbot-ui, AFFiNE,
    CopilotKit, ruflo and gpt-pilot (§5). Its `TOAST_LIMIT = 1` and `TOAST_REMOVE_DELAY = 1000000`
    constants are the most-duplicated lines of toast code on GitHub, and both are widely regarded as
    bugs nobody changed.
  - **React Aria's `ToastRegion`** is the only implementation surveyed that **rejects the live-region
    approach outright** in favour of a focusable landmark. That is a genuine architectural fork and
    §4/§7 treat it as one.

**Recommendation: name it `toast`.** No QDS name to match; universal agreement elsewhere.

---

## 2. What exists in QDS instead

Nothing. There is no toast, no notification region, no live-region helper, and no `alert` usage
outside individual components' error parts. The nearest relatives:

- **`modal`** — the elevated, dismissible surface with a title, a description and a close button. Its
  part inventory (`root`, `trigger`, `content`, `title`, `description`, `close`) is the closest QDS
  precedent for a toast's inner shape, and §7 borrows those names rather than inventing.
- **`popover`** — the `popover="auto"` + top-layer machinery. A toast region is a *manual* popover
  (§7).
- **`visually-hidden`** — QDS's clipped-but-announced wrapper, already ported as
  `packages/headless/components/src/base/visually-hidden.tsrx`. A screen-reader-only live region uses
  it.
- Component-level error parts (`checkbox.error`, `textbox.error`) use plain elements with no live
  region at all, so they set no precedent either.

**Consequence: this is the one tranche-4 family that is coverage creation, not conversion.** There
are no QDS tests to port, no QDS naming to match, and no QDS behaviour to be parity-checked against.
The parity table needs a row saying exactly that, in the same shape as the `scroll-area` note.

---

## 3. Headless library survey

Fetched 2026-08-22.

| Library | Parts | How it is triggered | Announcement mechanism | Limit | Default timeout |
| --- | --- | --- | --- | --- | --- |
| **Base UI** (v1.7.x) | `Provider`, `Portal`, `Viewport`, `Root`, `Content`, `Title` (`<h2>`), `Description` (`<p>`), `Action`, `Close`, `Positioner`, `Arrow` | `Toast.createToastManager()` (global) or `useToastManager()`; `add`/`update`/`close`/`promise` | **live region**, `polite` for `priority: 'low'`, `assertive` for `'high'`; **plus** an F6-focusable landmark | `limit: 3`, excess kept mounted with `inert` and `data-limited` | `timeout: 5000`, `0` disables |
| **Radix UI** | `Provider`, `Viewport`, `Root`, `Title`, `Description`, `Action`, `Close` | render `<Toast.Root>` yourself, or build your own imperative API | live region; `type: 'foreground' \| 'background'` maps to assertive/polite | none | `duration: 5000`; `swipeDirection: 'right'`, `swipeThreshold: 50`, `label: 'Notification'`, `hotkey: ['F8']` |
| **Ark UI** (Zag) | `Root`, `Title`, `Description`, `ActionTrigger`, `CloseTrigger` + `createToaster()` | `toaster.create()/success()/error()/promise()/update()` | live region (implicit in the machine) | `max: 24` | type-dependent; `removeDelay: 200`, `gap: 16`, `offset: 1rem`, `hotkey: alt+T` |
| **React Aria** | `ToastRegion`, `Toast`, `ToastContent`, `ToastTitle`, `ToastDescription`, `Button` + `ToastQueue` | `queue.add()` returns a key; `queue.close(key)` | **landmark region, no `aria-live`** — F6/Shift+F6 to jump to it | `maxVisibleToasts` | `timeout`, minimum 5000 recommended; pauses on hover/focus |
| **Kobalte** | `Toast.Region`, `Toast.List`, `Toast.Root`, `Title`, `Description`, `CloseButton`, progress parts + `toaster` | `toaster.show()` | live region | `limit` | `duration` |
| **shadcn `use-toast`** | (copied Radix parts) | `toast({ title, description })` | Radix's | **`TOAST_LIMIT = 1`** | `TOAST_REMOVE_DELAY = 1000000` (≈16.7 minutes) |

Consensus and the two real forks:

- **The inner parts agree**: root, title, description, close, and (contentiously) action. Every
  library has those five. That maps onto QDS's `modal` inventory almost exactly, which is the naming
  luck this family needs.
- **Every library has a region/viewport part** that exists *before* any message. Called `Viewport`
  (Base UI, Radix), `Region` (Kobalte, React Aria), or created implicitly by `createToaster()` (Ark).
  §4 explains why its pre-existence is not a detail.
- **Fork 1 — how a message is created.** Every library except Radix ships an **imperative manager
  outside the component tree**: `createToastManager()`, `createToaster()`, `new ToastQueue()`,
  `toaster`. This is the only family in the whole migration whose primary API is a function call
  rather than markup, and §7 is where that meets our model.
- **Fork 2 — live region vs landmark.** Base UI does both. Radix, Ark and Kobalte do a live region.
  **React Aria does only a landmark**, on the stated grounds that landmarks give "an easy way for
  keyboard users to jump to toasts from anywhere in the app", with focus moving "to the next toast if
  any" when one closes. Radix's own tracker carries an open bug titled *"Toast not announced to
  screen readers due to `aria-live="off"`"* — evidence the live-region path is not free either.
- **Keyboard hotkeys are universal and all different**: F6 (Base UI, React Aria), F8 (Radix),
  `alt+T` (Ark). All three exist because a floating region is otherwise unreachable from the keyboard
  without tabbing past the whole page.
- **`Action` is in every library and every accessibility source says do not use it** (§4). Radix
  softens it with an `altText` prop describing another way to do the same thing.

---

## 4. WAI-ARIA, WCAG, and expert commentary

### APG — Alert (`w3.org/WAI/ARIA/apg/patterns/alert/`)

Short enough to quote nearly whole:

- Keyboard interaction: **"Not applicable."**
- Roles/states/properties: **"The widget has a role of `alert`."** That is the entire ARIA section.
- **"alerts...do not affect keyboard focus"** — the line that separates an alert from an alert dialog.
- Two WCAG warnings: avoid alerts that "disappear automatically" (SC 2.2.3 No Timing), and minimise
  alert frequency for users with visual and cognitive disabilities (SC 2.2.4 Interruptions).
- And the gotcha: dynamically rendered alerts announce automatically, but **an alert already present
  at page load does not**.

### Scott O'Hara, *Are we live?* (2022) — the implementation rule

The rule that decides our API shape, quoted: *"ensuring an empty live region exists in your DOM, and
injecting content into it when necessary, proves to be the most robust way."* Dynamically creating a
live region, or toggling one with `display: none`, produces inconsistent support. He also names
`<output>` as the native option (implicit `role="status"`) and warns that multiple simultaneous
live-region announcements overwhelm users.

### Scott O'Hara, *A toast to an accessible toast* (2019)

- `role="status"` for ordinary toasts, `role="log"` for toasts that are logged and reviewable.
- On interactive content: *"If an action is important, and there's no other means to perform said
  action, it should **not** be included within a toast component."* Alternatives: duplicate the
  action elsewhere, or a notification history.
- WCAG 2.2.1 (Timing Adjustable) is ignored by most toast components.
- Forward-looking: the `popover` attribute is a plausible foundation, but popovers alone are
  insufficient — a dedicated element with built-in live-region support would be better.

### Adrian Roselli, *Defining 'Toast' Messages* (2020) — the hard one

He lists the success criteria toast messages typically fail: **1.3.2** Meaningful Sequence, **1.4.4**
Resize Text, **1.4.10** Reflow, **2.1.1** Keyboard, **2.2.1** Timing Adjustable, **2.4.3** Focus
Order, **3.2.4** Consistent Identification, **4.1.2** Name Role Value, **4.1.3** Status Messages.
Nine. His summary is that few — "none that I have found so far" — of the toast patterns in the wild
would pass an audit.

Two conclusions we must carry:

1. **Auto-dismissing after a few seconds violates 2.2.1** unless the user can adjust, extend, or turn
   off the timing. His workarounds: let the user set the duration in advance, let them extend it per
   message, or keep messages up much longer.
2. **A toast with interactive content is not a toast.** *"If interactive content is necessary, the
   pattern fundamentally changes — it becomes a modal or non-modal dialog"* requiring `role="dialog"`.
   He also notes that none of the live-region roles suit rich or interactive content: they map to
   live regions, so a reader announces the raw text and drops the structure.

His ranked recommendations: a messages holder (notification centre), or static in-flow messages at
the top of the page, or **do nothing** — question whether toasts add value or just noise.

### Sara Soueidan, *Accessible notifications with ARIA Live Regions* (parts 1–2)

Same conclusions from a different angle, plus `<output>` (implicit `role="status"`) and the finding
that VoiceOver+Safari announces a *button* added to a live region — i.e. interactive content inside a
live region is announced in a way that misleads, because it cannot be reached from where the
announcement happened.

### What this adds up to

The accessibility literature is close to unanimous and it is **more negative about this component
than about any other family in the migration**. A defensible toast:

- announces its text and nothing structural;
- contains no interactive content except, arguably, a close button;
- does not auto-dismiss, or lets the user control the timing;
- has a region that exists before the first message;
- does not move focus;
- and is paired with a durable place to re-read what was said.

Every library in §3 ships something more permissive than that. **Our differentiator, if we want one,
is to ship the defensible version and document the rest as recipes.** That is a product decision and
it is §10 question 1.

---

## 5. GitHub patterns (grep MCP)

Searches whose toast-relevant hits are recorded here: `role="status" aria-live="polite"` (TSX),
`aria-live="assertive"` (TSX), `role="log"` (TSX), `TOAST_LIMIT` (TS/TSX), `useToastRegion` (TS/TSX),
plus the cluster sweeps (`popover="auto"`, `popover="hint"`, `.showModal()`, `anchor-name:`).

- **`role="status"` + `aria-live="polite"` together is the most common live-region shape and it is
  redundant** — `role="status"` already implies `aria-live="polite"`. Found in mastra (four places),
  WooCommerce, Storybook, wp-calypso, paperclip, compozy, docmost and more. Harmless, but it shows
  people are cargo-culting rather than reading. Our library should emit **one** of the two and say
  which and why.
- **`VisuallyHidden` + `role="status"` + `aria-atomic="true"` is the good pattern**, and docmost's
  editor uses it *twice in a row* for two independent announcements — count and selection — which is
  the correct way to stop one region clobbering another.
- **Grafana's `AppNotificationList.tsx` is the closest thing found to the design §7 recommends**:
  ```tsx
  <div className="sr-only" role="log" aria-live="polite" aria-atomic="true" aria-label={liveRegionMessage} />
  ```
  A **permanently-mounted, empty, screen-reader-only region** separate from the visible toast stack,
  plus a comment saying the toasts are portalled so they "paint above an open modal and clicking them
  does not dismiss it". Both halves are exactly the problems §7 and `research-popover.md` §7 name.
- **`role="log"` is used well, and for a stated reason.** `opengeos/GeoLibre` carries the clearest
  comment found: *"`role="log"` (`aria-atomic="false"`) announces only the newly added entry, rather
  than re-reading the whole region the way `role="status"` would."* That is the real status-vs-log
  distinction, and it decides whether a second toast re-announces the first. `facebook/astryx`'s
  `ChatMessageList` adds the streaming caveat: a `role="log"` region re-announces accumulating
  partial text on every mutation unless you suppress it.
- **`TOAST_LIMIT = 1` is copy-pasted near-verbatim across at least nine unrelated repositories** —
  marimo, RAGFlow, cal.diy, cline (twice), chatbot-ui, AFFiNE, CopilotKit, ruflo, gpt-pilot — always
  with the same reducer:
  ```ts
  case "ADD_TOAST":
    return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
  ```
  A limit of 1 means **the second message silently destroys the first**, which fails 4.1.3 for the
  destroyed one. `TOAST_REMOVE_DELAY = 1000000` sits next to it in most copies. This is the most
  widespread toast implementation in the world and it is wrong twice over. **Our `limit` default must
  not be 1, and messages past the limit must wait, not vanish** — which is what Base UI does (`inert`
  + `data-limited`, still mounted).
- **`aria-live="assertive"` is overused for things that are not urgent** — remix-project's toaster
  puts `role="alert" aria-live="assertive" aria-atomic="true"` on *every* toast including loading
  spinners; several repos use assertive for ordinary form errors. Assertive interrupts whatever the
  reader is saying. **Our default must be polite**, with urgency opt-in.
- **`useToastRegion` (React Aria) has real adoption** — Backstage, Keystatic,
  `suitenumerique/meet`, Adobe's own starters. The landmark-only approach is not theoretical; it
  ships in production design systems.

---

## 6. Expected screen-reader behaviour

**Source:** `w3c/aria-at`, test plan `tests/apg/alert`, read 2026-08-22. It is the smallest plan in
the repository — **one test, two assertions** — and there is **no toast, notification, status or log
plan at all**.

```
assertionId  priority  assertionStatement
roleAlert    3         Role 'alert' is conveyed
textHello    1         Text 'Hello' is conveyed

testId        title             setupScript       instructions
triggerAlert  Trigger an alert  setFocusOnButton  "Starting at the 'Trigger Alert' button, activate the button to trigger the alert."
```

**Sequence A — Trigger an alert** (`triggerAlert`)

1. keypress `Enter`/`Space` on the "Trigger Alert" button
2. → "Hello" `[p1: textHello]`
3. → "alert" `[p3: roleAlert]`

**Read the priorities.** Conveying the message text is priority 1. Conveying the *role* is priority
**3** — nice to have. There is no assertion about focus, about a region name, about position, or
about dismissal. The community-vetted requirement for this whole class of component is: **the words
reach the user.** Everything else the libraries build is unassessed by the reference suite.

**Derived, not vetted — a toast with a close button.** aria-at has nothing here, and the literature
(§4) says the case should not exist. If a consumer builds it anyway:

1. the toast appears → "Saved to drafts" (the region announces the text)
2. → the close button is announced **only if** the region is `aria-atomic` and contains it, and Sara
   Soueidan's finding is that VoiceOver+Safari *does* announce it — as a button the user cannot reach
   from where the announcement happened
3. the user must go find it: `Tab` past everything, or the library's hotkey (F6/F8/`alt+T`)

**Step 2 is the failure.** It is why React Aria abandoned the live region for a focusable landmark,
and why Roselli says an interactive toast is a dialog. The design in §7 resolves it by separating
announcement from interaction: an announcement-only live region carrying **text**, and a visible
stack that is an ordinary reachable region — so nothing is announced that cannot be reached.

**Reader differences.** Live regions are, in Scott O'Hara's words, "quirky in how they expose" across
browsers and readers, and there is no vetted source to pin exact strings against. A transcript test
for this family should assert **that the message text was conveyed once, and not twice** — duplicate
announcement is the characteristic bug when a visible toast is *also* inside a live region.

---

## 7. Markless API design

### The shape of the problem

Toast differs from every other family in this migration in one structural way: **the thing that
creates a toast is not in the markup.** A save handler three components away calls something. Every
library answers this with an imperative manager created outside the tree (§3, fork 1).

Markless has a direct answer and it is already in the public API. From
`packages/core/src/framework-api.ts`:

```ts
export type SharedScope = 'request' | 'container' | 'page' | 'widget';
```

and from `specs/framework/03-state-graph.md:570-605`: *"`session()` does not mean 'run a hook.' It
means: resolve this named dataflow instance for the current graph context"*, with *"There is no
`provide()` or `create()` in v1"* — a bare call resolves the active instance. The spec's worked
example is a page-scoped `session` with `login()`/`logout()` methods called from anywhere.

**A toast queue is that, exactly.** `toastQueue()` inside a save handler resolves the page's queue,
and `.show('Saved')` adds a message. No manager object, no provider component, no context id, **no
new authoring API**. This is the cleanest fit between this framework's model and a component-library
problem found anywhere in the migration — and it is also **the first place the family conventions
break**, because they say the family's `shared()` is `{ scope: 'widget' }` and *internal only, never
surfaced in the API*. For toast the shared definition **is** the API. §10 question 2.

### Parts

`toast.area`, `toast.root`, `toast.title`, `toast.description`, `toast.close`.

- **`area`** is a canonical role for a bounded region in our naming grammar (as in
  `carousel.scrollarea`); it is the viewport/region every library has under a name we do not use
  (`Viewport`, `Region`). Not invented — taken from our own canonical role list.
- **`root`, `title`, `description`, `close`** are exactly QDS's `modal` names for the same four
  things, which is the closest available precedent (§2).
- **No `action` part.** §4 is unanimous. A consumer who insists can put a button inside `toast.root`
  with ordinary markup; we will not bless it with a part, and the docs will say why and point at the
  notification-centre alternative.
- **No `provider`, no `portal`, no `positioner`** — no context primitive is needed (the queue is the
  shared definition), elevation is the platform's, position is CSS.

### Types (`toast-types.ts`)

```ts
import type { PropsOf } from '@markless/core';

/** One message waiting to be shown or currently showing. */
export type ToastMessage = {
	/** Identifies the message so it can be changed or taken away again. */
	readonly key: string;
	readonly title: string;
	readonly description?: string;
	/** The message interrupts whatever a screen reader is saying. Use it for failures. */
	readonly urgent?: boolean;
	/** How long the message stays, in milliseconds. Zero means it stays until dismissed. */
	readonly stayFor?: number;
};

export type ToastAreaProps = PropsOf<'div'> & {
	/** Names the region for people who reach it with the keyboard. */
	readonly label?: string;
	/** How many messages show at once. The rest wait their turn. */
	readonly limit?: number;
	/** How long a message stays by default. Zero means messages stay until dismissed. */
	readonly stayFor?: number;
};

export type ToastRootProps = PropsOf<'div'> & { readonly message: ToastMessage };
export type ToastTitleProps = PropsOf<'div'>;
export type ToastDescriptionProps = PropsOf<'div'>;
export type ToastCloseProps = PropsOf<'button'>;
```

### The queue, and its lifecycle spelled out

```tsx
export const toastQueue = shared(
	() => {
		const q = state({
			/** Everything asked for, oldest first. */
			pending: [] as ToastMessage[],
			/** What the most recent message said, for the announcing region to read. */
			announcement: '',
			urgent: false,
			limit: 3,
			stayFor: 0,
			nextKey: 0,
		});

		const showing = computed(() => q.pending.slice(0, q.limit));
		const waiting = computed(() => q.pending.slice(q.limit));

		return {
			...q,
			showing,
			waiting,
			show(title: string, detail?: Partial<Omit<ToastMessage, 'key' | 'title'>>) {
				const key = `t${q.nextKey++}`;
				q.pending = [...q.pending, { key, title, ...detail }];
				q.urgent = detail?.urgent === true;
				q.announcement = detail?.description ? `${title}. ${detail.description}` : title;
				return key;
			},
			revise(key: string, next: Partial<ToastMessage>) {
				q.pending = q.pending.map((m) => (m.key === key ? { ...m, ...next } : m));
			},
			dismiss(key: string) {
				q.pending = q.pending.filter((m) => m.key !== key);
			},
			dismissAll() {
				q.pending = [];
			},
		};
	},
	{ scope: 'page' },
);
```

**The lifecycle, in plain words.** This is the "state machinery" the packet asks to be spelled
without jargon, and the point of writing it this way is that there is almost nothing to spell:

1. A message is **asked for**. `show()` appends it to `pending` and returns a key. Nothing about
   where it renders is decided here.
2. A message is **showing** when it is among the first `limit` entries of `pending`. `showing` is a
   plain computed slice, so a message becomes visible the instant an older one leaves — there is no
   promotion step and nothing to schedule.
3. A message is **waiting** when it sits past the limit. It stays in `pending`, it stays announced
   (it was announced when it was asked for), and it becomes showing on its own. **It is never
   discarded** — the shadcn `slice(0, 1)` bug (§5) is structurally impossible here, because the slice
   is a view rather than a write.
4. A message **leaves** when `dismiss(key)` removes it: from a close button, from a timer, or from
   the caller. Removal is one array filter.
5. **Announcement is separate from display.** `announcement` is a plain string that `toast.area`
   renders into a permanently-mounted, visually hidden region. That satisfies O'Hara's rule (§4)
   structurally: the region exists from first paint and only its text changes.

Two things this deliberately does **not** have: no per-message condition value, and no scheduler. A
message's condition is derivable from its position in one array, which is why the whole model fits in
twenty lines.

### The area

```tsx
export function ToastArea({ label = 'Notifications', limit = 3, stayFor = 0, children, ...rest }: ToastAreaProps) @{
	const toasts = toastQueue();
	toasts.limit = limit;
	toasts.stayFor = stayFor;

	<div {...rest} popover="manual" overlay role="region" aria-label={label} tabindex={-1}>
		<VisuallyHidden>
			<div role="status" aria-live={toasts.urgent ? 'assertive' : 'polite'} aria-atomic="true">
				{toasts.announcement}
			</div>
		</VisuallyHidden>
		{children}
	</div>
}
```

- **`popover="manual"`, not `"auto"`.** A toast region must not light-dismiss, must not close on
  Escape, must not be evicted when a popover or dialog opens, and must not evict anything itself.
  `manual` is defined as exactly that: no light dismiss, several at once, **no participation in
  either stack** (`research-popover.md` §4). It is also the one `popover` value whose semantics match
  the `overlay` mark's "elevation only, no dismissal policy" doc comment word for word (§8).
- **`role="region"` + `aria-label` + `tabindex={-1}`** makes it a landmark a keyboard user can reach,
  which is the React Aria half of the design.
- **The live region is separate, hidden, permanent, and carries text only.** That is O'Hara's rule
  and the resolution of §6's step-2 failure: nothing announced is unreachable, because what is
  announced is words and what is reachable is the visible stack.
  **Re-anchored 2026-08-23 — this bullet is superseded.** A hidden inner region makes the visible
  stack `inert` and `aria-hidden` whenever a modal is open, because the overlay pass spares the
  subtree holding the live region and marks its siblings. The live region must be the toaster root
  itself. See "Re-anchored 2026-08-23" above for the evidence.
- **`aria-live` flips between polite and assertive**, defaulting polite (§5's overuse finding).
  `role="status"` is kept alongside because it is what `getByRole('status')` finds; the docs must say
  the role is the semantics and `aria-live` is the urgency.
- **`role="log"` is deliberately not used**, despite GeoLibre's good argument (§5):
  `aria-atomic="true"` on a region whose whole content is one message gets the same
  announce-only-the-new-thing result without `log`'s history semantics. §10 question 5.

### The messages

Rendering the queue is `@for` over `toasts.showing`, keyed by `message.key`, with a `toast.root` per
row. **That is the blocker** — see §8 and §10 q3.

```tsx
export function ToastRoot({ message, children, ...rest }: ToastRootProps) @{
	<div {...rest} ui-urgent={message.urgent === true}>{children}</div>
}

export function ToastClose({ children, onClick, ...rest }: ToastCloseProps) @{
	const toasts = toastQueue();
	// The key has to come from the enclosing row; see the open question about how
	// a row part learns which message it is rendering.
	<button {...rest} type="button" onClick={(event) => { /* toasts.dismiss(key) */ onClick?.(event); }}>
		{children}
	</button>
}
```

`toast.root` holds **no shared instance of its own**. That is deliberate: a `{ scope: 'widget' }` root
inside a `@for` is the unproven case (§8), and a toast row genuinely has no state — it is a
projection of one array entry. The cost is that `toast.close` cannot work out "which message am I"
from an instance and has to be told, which is §10 question 4.

**Re-anchored 2026-08-23 — the cost is no longer forced.** A row part learning which item it renders
is solved and shipped: an item-level `shared()` seeded from the row's own props, resolved by every
descendant part. A widget-scoped root inside a `@for` is also no longer the unproven case. See
"Re-anchored 2026-08-23" above, and the caveat there about arrays that grow.

### Timing, and 2.2.1

**Default `stayFor: 0` — messages stay until dismissed.** That is the WCAG 2.2.1 / SC 2.2.3 default
(§4), it is the opposite of every library surveyed (5000ms), and it is the single most defensible
divergence available in this family. A consumer who sets `stayFor={5000}` has made a choice and owns
it; a consumer who sets nothing ships something that passes an audit. §10 question 1 asks whether we
are willing to be the odd one out.

Auto-dismissal, when asked for, is a `setTimeout` per message that calls `dismiss(key)` — landing on
the same unproven timer ground as tooltip (`research-tooltip.md` §7), plus the pause-on-hover
behaviour every library has and 2.2.1 arguably requires.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `@for` over a runtime-growing array whose rows are family parts | no fixture anywhere combines widget parts with `@for`; §8 |
| A row part knowing which message it renders | no per-row instance; §10 q4 |
| A timer per message with framework-owned teardown | `research-tooltip.md` §7; the `attach` seam is the candidate |
| A page-scoped `shared()` shipped from a library package | the scope is in the public type; **no shipped family uses anything but `widget`**, so it is unexercised |
| Pause-on-hover for the dismiss timer | the timer question again |

**Re-anchored 2026-08-23.** Row 1's stated blocker ("no fixture anywhere...") is stale, and row 2's
("no per-row instance") is solved. Row 1 stays in the table for a different reason: a keyed repeat
does not follow a source array whose length changes when the rows root widgets. See "Re-anchored
2026-08-23" above.

---

## 8. Contribution to the overlay-primitive memo

Consolidated in `research-popover.md` §7. Toast's contributions, and they are the least comfortable
in the cluster:

1. **R14 — a runtime-growing list of rendered rows — is a blocker unique to toast, and it is
   unproven.** Every other family in this migration renders a fixed set of parts. Toast renders
   `@for (const m of toasts.showing; key m.key)`. Two things are unknown: whether family parts may
   live inside a keyed repeat at all (`shared-seed-pass.ts` states the seed walk skips chunks
   "reached through a repeat, branch, or async arm", and no fixture in
   `packages/vitest-browser/browser/fixtures/` combines `scope: 'widget'` with `@for` — the same gap
   `research-tabs.md` §6b(5) names), and whether an array that grows *after* resume re-renders
   correctly. The design in §7 sidesteps the first by giving rows no instance; the second is
   unavoidable. **Spike it before the toast unit is cut, and sequence toast last in tranche 4.**

   **Re-anchored 2026-08-23 — half retired, half now red.** The "no fixture anywhere" half is stale:
   four `rpt-*` fixtures put widget-rooting parts inside a keyed `@for`, one against the real
   `@markless/ui` checkbox family. The growing-array half is no longer unknown either — it is
   measured red, because a keyed repeat does not follow its source when the rows root widgets. See
   "Re-anchored 2026-08-23" above.
2. **Toast is the first family that wants a non-`widget` `shared()` scope**, and the first whose
   shared definition is *public API* rather than internal. Both are conventions, not framework
   limits, and both are stated in the conventions this migration works under. The memo should record
   that the overlay cluster is where "one internal widget-scoped factory per family" stops being
   universal.
3. **`popover="manual"` is the third distinct platform elevation mode the cluster needs** — after
   `auto` (popover) and `hint` (tooltip). Manual is the one whose semantics — elevation, no dismissal
   policy, no stack participation — match the `overlay` mark's doc comment exactly. **If an overlay
   emitter is ever written, `manual` is the right web lowering**, and toast is the evidence for that
   (`research-popover.md` §7.3).
4. **Toast is the only family with a requirement the platform does not address at all: the live
   region** (R15). There is no `popover="announce"`, and O'Hara's 2019 wish for "a dedicated toast
   element with built-in live region support" has not been granted. This is the one place in the
   cluster where the answer is ordinary rendering plus a disciplined API shape, and where the *shape*
   is load-bearing: the region must be rendered by `toast.area` from first paint, or the family
   silently stops announcing with no visible symptom. R15 is therefore **met by the framework and at
   risk from the API** — a different kind of entry in the memo from the rest.
5. **Toast confirms the layering requirement from the other direction.** Grafana's comment (§5) —
   toasts portalled so they "paint above an open modal and clicking them does not dismiss it" — is
   the same problem as Roselli's popover-over-dialog, and `popover="manual"` solves it natively:
   manual popovers do not participate in the auto stack, so a modal opening does not evict the toast
   region and clicking a toast does not light-dismiss the dialog. **A toast region that used
   `popover="auto"` would vanish the moment a dialog opened.** That is a concrete, testable
   consequence of picking the right platform mode, and it is a required test row (§9).

---

## 9. Test plan

`packages/headless/components/src/toast/toast.browser.ts`, scenarios under `src/toast/scenarios/`.
This family is **coverage creation, not conversion** (§2), so the parity table gets one row saying so
rather than a QDS-file mapping.

Scenarios: `toast-basic.tsrx` (a button that calls `show()`, an area, one message shape),
`save-flow.tsrx` (the realistic case: a form whose submit shows a success message and whose failure
shows an urgent one), `limit.tsrx` (`limit={2}` with four messages asked for),
`stays-until-dismissed.tsrx` (default `stayFor`), `auto-dismiss.tsrx` (`stayFor={5000}`),
`toast-over-modal.tsrx` (a message asked for while a modal is open).

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| the hidden live region is **present and empty** before any message is asked for | O'Hara's rule; the most important row in the family, and the one that regresses silently |
| asking for a message puts its text in the live region **once** | §6: duplicate announcement is the characteristic bug |
| the text appears in the live region **and** in the visible stack, and the visible stack is **not** inside the live region | otherwise it announces twice |
| `urgent` flips `aria-live` to `assertive`; the default is `polite` | §5's overuse finding |
| with `limit={2}` and four messages asked for, exactly two render and **all four are still in the queue** | the shadcn `slice(0, 1)` bug made impossible |
| dismissing a showing message promotes the next waiting one | the promotion path, without a scheduler |
| the area is reachable: `role="region"` plus an accessible name | the landmark half |
| the area has `popover="manual"` | asserted, not assumed |
| **opening a modal does not remove the toast area, and clicking a toast does not close the modal** | §8 point 5; the row that proves the platform-mode choice |
| with default `stayFor`, a message is still there after a long wait | WCAG 2.2.1 as a test |
| with `stayFor={5000}`, the message goes away, and hovering it postpones that | the timer path, red-first if R13 is unresolved |
| SSR: the area and its empty live region are in the served HTML; the first message asked for after resume announces and renders | the resume path for a growing list — **the row most likely to be red** |
| two messages asked for in the same turn both render, in order | the array-write batching question |
| a message asked for from a component that does not render the area resolves the same queue | the page-scope contract, which nothing else in the library exercises |

**Not tested, and why:** actual screen-reader announcement (no aria-at plan beyond the
two-assertion `alert` one, §6) — we assert the region's content and attributes, not utterances.
Anchored toasts (Base UI's `Positioner`/`Arrow` variant) are out of scope. Swipe-to-dismiss is out of
scope and should stay out: it is pointer-only and duplicates the close button.

---

## 10. Open questions

1. **Do we default to no auto-dismiss?** Recommended: yes — `stayFor: 0`, messages stay until
   dismissed. It is what WCAG 2.2.1 and every expert source asks for (§4) and it is the opposite of
   all five libraries surveyed. It will read as "broken" to anyone who has used Sonner. **This is a
   product decision and should be made deliberately, not defaulted into.**
2. **Toast's `shared()` is page-scoped and public**, breaking two stated family conventions ("one
   `{ scope: 'widget' }` factory per family"; "internal only, never surfaced"). The framework
   supports it (`SharedScope` includes `'page'`; spec 03's worked example is exactly this shape), but
   no shipped family exercises it. Needs an explicit ruling that toast is the sanctioned exception,
   plus a spike proving a page-scoped `shared()` **shipped from a library package** resolves
   correctly across SSR and resume.
3. **Family parts inside `@for`, and an array that grows after resume** (§8 point 1). Unproven,
   blocking, cheap to probe. **Toast should be sequenced last in tranche 4 and gated on this spike.**
   **Re-anchored 2026-08-23 — narrowed, not answered.** Family parts inside a keyed `@for` are
   proven. The growing array is the live blocker and it is now red rather than unproven, so what
   toast waits on is a framework fix the combobox unit already filed as its top-priority follow-up,
   not a probe. See "Re-anchored 2026-08-23" above.
4. **How does `toast.close` learn its message key?** The design gives rows no instance (§7), so the
   options are: (a) `<toast.close message={m}>` — explicit, a little ugly, and honest; (b) give
   `toast.root` a widget-scoped instance seeded with the message, which reopens q3 in its harder
   form; (c) drop `toast.close` and let consumers write
   `<button onClick={() => toasts.dismiss(m.key)}>`, which the "every piece of markup is free"
   principle arguably favours. Recommended: (a) for v1, revisit once q3 is answered.
   **Re-anchored 2026-08-23 — answered, and option (b) is the shipped shape.** A row part learns its
   own item from an item-level `shared()` seeded from that row's props, which is what combobox and
   radio group already do. It no longer "reopens q3 in its harder form", because the part of q3 it
   depended on is retired. See "Re-anchored 2026-08-23" above.
5. **`role="status"` vs `role="log"` for the announcing region.** Recommended: `status` +
   `aria-atomic="true"`. `log` announces only additions (GeoLibre's argument, §5) but carries history
   semantics we do not implement. Worth one word, since it is a one-token change and awkward to alter
   later.
6. **Is an `action` part really excluded?** Recommended: yes, per §4's unanimity, with a documented
   recipe for the dialog alternative. It will be the most-requested missing part, so the reasoning
   needs to live in the docs and not only here.
7. **Should we ship the notification-centre companion** that Roselli and O'Hara both name as the fix
   for "the message disappeared and I missed it"? Not a family in the tranche list; recommended as a
   documented pattern over `toastQueue`'s `pending` array, which already retains everything.
