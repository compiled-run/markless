# toolbar — the first family built out of cross-family registration

**Unit:** `headless-pilot-2026-08-22/U660`
**Built on:** the pilot tip merged into this worktree (base guard
`packages/compiler/test/enclosing-registration/adopted-widget-nodes.test.ts`
present after the merge).
**Family:** `packages/headless/components/src/toolbar/`
**Registration edits:** `toggle/toggle.tsrx`, `togglegroup/togglegroup.tsrx`,
`select/select.tsrx`
**Design record:** `src/toolbar/note.md` carries the shape, the refusals and the
reference mapping. This memo carries what was *measured* and what it cost.

## Verification

| command | result |
| --- | --- |
| `pnpm typecheck` | clean |
| `vp test --project ui` on toolbar + toggle + togglegroup + select | 4 files, **187 passed** |
| `pnpm test:sr` | 35 files, **285 passed**, 10 expected fail, 4 skipped (the 10 are the tip's pre-existing pins) |
| `pnpm exec vp lint --deny-warnings` | 0 warnings, 0 errors |

`toolbar.browser.ts` is 40 rows, every one in both CSR and SSR resume.
`toolbar.sr.ts` is 4 rows on the virtual reader. The NVDA and VoiceOver lanes are
written and have **never been run** — CI only.

The 147 pre-existing rows of `toggle`, `togglegroup` and `select` were run before
and after the registration edits and are unchanged.

## The measurement that decided the design

The first design had each control render its own roving `tabindex` by comparing
itself to the bar's roster. The compiler refuses that outright, and the error is
worth quoting because it forecloses the whole class:

> `MARKLESS_ELEMENT_HANDLE_UNBOUND`: Cannot read element handle "item.el" inside
> computed "stop": element() handles are DOM-bound and readable only in event
> handlers, so "el" is undefined on every derivation.

Consequences, in order:

1. **No part can ask "am I the first control in this bar?" at render time.** Not
   a foreign control, and not `toolbar.item` either. Roving tabindex cannot be
   declarative here.
2. So **the bar writes `tabindex` onto the roster elements from its own
   handlers** (`applyStops`). Writing `tabIndex` on elements the family already
   holds handles for is a write, not a lookup; nothing queries the DOM.
3. That leaves the cold page with no control able to carry the stop, so **the bar
   carries it itself**: `toolbar.root` renders `tabindex="0"` until `entered`,
   every control renders `-1`, and the first `focusin` hands focus on and drops
   the bar out of the tab order permanently.

Measured cold and warm, CSR and SSR:

| moment | bar | items |
| --- | --- | --- |
| before any gesture | `0` | `-1 -1 -1` |
| after entering | `-1` | `0 -1 -1` |
| after ArrowRight | `-1` | `-1 0 -1` |

The cost, named: arriving backwards with Shift+Tab lands on the bar, which
forwards to the control holding the stop rather than to the last control. After
the first entry the bar is `-1` and Shift+Tab from below returns to the
remembered control.

## How the two keyboards compose — no cooperation required

The bar asks one question after the key bubbles to it: *did focus move?*

```ts
const from = event.target;
const landed = document.activeElement;
if (landed !== from) { /* the control spent the key; only record the stop */ }
```

No flag, no `stopPropagation`, and no control was told it is in a toolbar. Three
cases, all pinned as rows:

- a select's ArrowDown opens its listbox and moves focus → the bar stands down;
- a toggle group's interior ArrowRight steps within the group, which is also the
  bar's next stop → the answers coincide;
- a toggle group's ArrowRight **on its last item** returns that same item (the
  group does not loop), so focus does not move, the bar takes the key, and focus
  leaves the group. **The edge of a nested walk becomes the bar's step for free** —
  this is the part of the design I did not expect to fall out.

`document.activeElement` and `event.target` are nodes the platform hands over,
which SPEC's DOM-access section names explicitly.

## A false alarm worth recording

A row asserting "a press inside the bar leaves the stop where it is" failed
twice, and the obvious reading — that a control re-rendering its own element
clobbers the bar's `tabindex` — was wrong. A programmatic `.click()` does not
move focus, so the bar's stop was legitimately still on the control I had left it
on. The diagnostic printed `0 -1 -1 -1 -1` before and after both presses: **no
clobber exists.** A speculative `onClick` re-assert added to the bar in between
was removed again. The row now focuses first, then presses, and passes.

## Deviations from the direction, and why

**`toggle` registers at the trigger, not at `toggle.root`.** The direction named
`toggle.root`, but the roster holds elements the bar calls `focus()` on and
`toggle.root` renders a `div`. The direction's own words — "register its
focusable element" — point at the trigger, which is a part of the toggle family
and a part of the enclosing toolbar at the same time.

**`toolbar.label` is a `span`, not a `label`.** A toolbar is not a form control,
so a `label` element would label nothing. Precedent: `tree`, `slider`, `crop`,
`ink`, `pad`, `progress`.

**`toggle/` has no `note.md`** — it has never had one — so the "one line per
note" instruction landed on `togglegroup/note.md` and `select/note.md` only. The
fact lives in `toolbar/note.md` and in a comment at the registration site.

**Disabled policy, as asked.** Every disabled control stays in the roster.
`toolbar.item disabled` writes `aria-disabled` and no native attribute, so it
stays focusable and an arrow lands on it — the APG rule. A control the browser
has taken out of the tab order (`toggle.trigger` disabled by its own family)
cannot take focus at all, so the walk goes past it; landing there would swallow
the key. The predicate is `element.disabled !== true`, which is the fact rather
than a guess about it.

**No `loop`.** Not in the direction's prop list, and `tabs`/`togglegroup` both
default wrapping off.

## Pinned rows for things that are true but surprising

- **A vertical bar's select takes the bar's axis.** Its ArrowDown opens the
  listbox and the bar does not move. This is the APG's own caution — allow at
  most one such control and make it last — so `scenarios/vertical.tsrx` is that
  arrangement and a row asserts it.
- **Home/End inside a toggle group reach the group's ends first.** The group
  handles them and moves focus, so the bar records instead of jumping to the
  bar's ends; a second press, where focus no longer moves, reaches the bar's
  first control.
- **A menu inside a toolbar renders and works, but its trigger is not a bar
  stop** — see the follow-up below.

## Follow-ups this unit names rather than does

1. **`menu.trigger` registration.** Held on purpose: a menubar branch is
   contending `menu.tsrx`. The wiring is the same three lines every other control
   took (read `toolbarState()`, add `toolbar.itemEls` to the `el` binding, take
   the tabindex from `mounted`). Until then a menu button inside a bar keeps its
   own tab stop and the arrows do not reach it. `scenarios/mixed.tsrx`
   deliberately contains no menu.
2. **A `toolbar` slot in `test-support/driver.ts`'s `Vocabulary`.** The virtual
   reader does announce "toolbar" and `toolbar.sr.ts` asserts it from a local word
   table (the `togglegroup.sr.ts` precedent for `pressed`). The real-reader
   transcript cannot assert the role word at all, because `Conveys.role` is keyed
   by `Vocabulary`; it asserts the bar's name instead. `test-support/**` was
   forbidden to this unit.
3. **Registration, gallery and CI.** `toolbar` is not exported from
   `src/index.ts`, so its scenarios import the family directly and
   `toolbar-transcript.ts` spells its own gallery anchor. Forbidden to this unit
   by the packet.
4. **The two real-reader lanes have never been run.** They need a CI runner or a
   VM; never the owner's desktop.
