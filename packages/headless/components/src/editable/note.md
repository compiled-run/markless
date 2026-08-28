# editable

Inline rename: one string shown as a control a person presses, edited in place in a field that
takes the same room, and put back. Preview ↔ edit is the whole machine.

The survey (Ark UI, Chakra v3, Zag's `editable` machine, React Aria — which ships none), the
naming decisions with their rejected alternatives, and the ruling on sharing helper code with
taglist live in `goals/headless-components/notes/U698-editable.md`. This file records what shipped
and what is still open.

## Anatomy

| Part | Element | Notes |
| --- | --- | --- |
| `editable.root` | `div role="group"` | named by `editable.label`; carries `ui-editing` and the value as `ui-value` |
| `editable.label` | `label` | `for` the field; names the root through `aria-labelledby`; a click lands focus on whichever element is showing |
| `editable.trigger` | `button` | the preview control; renders the value, or the placeholder while it is empty |
| `editable.input` | `input type="text"` | `hidden` until a session opens; carries no `name` |
| `editable.description` | `div` | in the `aria-describedby` of both the preview and the field |
| `editable.error` | `div role="alert"` | named first in `aria-describedby` |
| `editable.field` | `input type="hidden"` | the one element a form receives |

Every name comes from SPEC's established roles. Nothing new was minted — in particular there is no
`preview` role: the preview-mode control is the thing that activates the widget, which is what
`trigger` already means. Ark's `Area` and `Control` wrappers are absent (layout with nothing to do),
and its separate Edit/Submit/Cancel buttons would need three names outside the established set; they
are an owner question in the memo, not code here.

## Behaviour

Activation: a click on the preview, and Enter or Space on it, because it is a real button.
`editOnDoubleClick` asks for two clicks instead — and the key path still opens, because a control
only a mouse can reach fails WCAG 2.1.1. `editOnFocus` opens on landing at all.

In the session: Enter commits the trimmed words and hands focus back to the preview; Escape
restores the value from before the session and hands focus back the same way; blur commits and
leaves focus where the person put it. `cancelOnBlur` flips that last one to a revert. Everything
else in the field — caret, selection, typing — is the native input's.

`disabled` takes the preview out of the tab order. `readonly` leaves it focusable and readable and
simply never opens a session.

## Consumer shape

```tsrx
const own = state({ title: 'Quarterly plan' });

<editable.root name="title" value={own.title} onChange={(next) => { own.title = next; }}>
  <editable.label>Document name</editable.label>
  <editable.trigger />
  <editable.input />
  <editable.field />
</editable.root>
```

Two things about that shape are load-bearing:

- The value must live on a state **object** (`own.title`), not in a reassigned `let`. The graph
  follows a property write.
- `editable.trigger` takes no children. A part cannot tell whether it was given any, so a fallback
  branch would render nothing for everybody; it renders the value itself.

## Findings

- **Assigning to an element binding inside `.tsrx` is refused.** `box.value = words` on a handle is
  `MARKLESS_STATE_READ_ONLY_WRITE`, even behind a `const` alias and an `undefined` guard. The write
  moved into `landCaret()` in `edit-walk.ts`, which takes the handle as an argument. taglist reaches
  the same place from the other side: its write goes through `elementForValue()`, so the compiler
  never sees the assignment against a binding either.
- **A singular element handle read inside a shared-instance method names no instance.** Calling
  `triggerEl?.focus()` from `settle()` threw `RuntimeResumeError: Element handle triggerEl is
  registered by 2 rendered widgets on this page` on the two-editables scenario — while every
  assertion still passed, so it surfaced only as an unhandled error. The focus call moved into the
  input part's own keydown handler, which is the taglist idiom. Worth knowing: `landCaret(inputEl,
  …)` inside the same shared method does **not** throw, so the boundary is narrower than "no handle
  reads in methods" and is not isolated here.
- **`aria-readonly` is not an attribute `button` supports**, so `readonly` reaches a reader as
  `aria-disabled="true"` on a still-focusable control rather than as Ark's `aria-readonly`. The
  screen-reader rows pin that this is what a reader hears.
- **The form scenario is uncontrolled on purpose.** The sibling taglist suite has a pinned red row
  where a controlled value write inside a `<form>` ancestor never reaches the family's value cell.
  `rename-form.tsrx` uses `defaultValue`, which keeps this family's form rows clear of that
  undiagnosed runtime question; both form rows are green.
- **No `<style>` block.** SPEC calls for CSS defaults where a family needs them. This one needs
  none: mode switching is the `hidden` attribute on the two elements, there is nothing anchored and
  nothing stacked. A consumer who sets `display` on the preview or the field defeats `hidden` and
  owns that.
- **Registration is a follow-up.** Scenarios import `* as editable from '../index.ts'` because the
  barrel has no `editable` export yet, and `editable-transcript.ts` spells its own gallery anchor
  because `FAMILY_ANCHORS` has no `editable` key. Both are marked in place for that unit, which is
  also what makes the `.nvda.ts` / `.voiceover.ts` lanes runnable — the gallery has no editable
  section today.
