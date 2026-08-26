# fileupload

A file upload: a labelled control, a region a file can be dropped onto, a browse
button that opens the operating system's picker, the real `<input type="file">`
that submits, and a row per chosen file.

## Parts

| Part | Element | What it is |
| --- | --- | --- |
| `root` | `div` | the upload; holds `accept`, `multiple`, `disabled`, `required`, `name`, `onChange`. Reports `ui-disabled`. |
| `label` | `label` | names the upload; its `for` points at the field, which is what gives the field an accessible name. |
| `droparea` | `div` | the region a drop lands on. Reports `ui-dragging` and `ui-disabled`. |
| `trigger` | `button` | opens the picker. The keyboard and reader route in. |
| `field` | `input[type=file]` | the real control, clipped and out of the tab order, and the element that submits. |
| `item` | `div` | one chosen file's row. |
| `itemlabel` | `span` | the file's name; falls back to the record's own name. |
| `itemclose` | `button` | takes that file off the upload. |

## Where the files live

A `File` is not a plain value, so it cannot go in a `state()` cell that has to be
written into the page and read back. The graph holds `FileRecord[]` — id, name,
size, type, lastModified — and the `File` objects sit in a module-level `WeakMap`
in `fileupload-files.ts`, keyed by the real input. That is the carousel engine's
shape: an imported module resolves to one store every handler shares, keyed by an
element, so nothing about it needs widget plumbing and it goes away with the page.

Every mutation rebuilds a `DataTransfer` and assigns `field.files = dt.files`.
That assignment is what makes a drop-only upload submit anything: files added by
drop are never in the input's own list otherwise. All DOM writes are in the plain
`.ts` module; the `.tsrx` never touches `.files`.

## The drag guard shape

Every drag handler writes its disabled guard as a positive `if` wrapping the call:

```
onDragover={(event) => { if (!upload.disabled) event.preventDefault(); … }}
```

Written the other way round — `if (upload.disabled) return; event.preventDefault();`
— the compiler's sync-policy extraction walks past the guard and takes the bare
call as unconditional. `preventDefault()` on `dragover` is what makes a drop
happen at all, so getting this backwards produces an upload that looks right and
silently accepts drops while disabled. The disabled-drop row in
`fileupload.browser.ts` is what holds it.

## Accessibility

QDS's `file-upload` ships no ARIA on any part, so there was nothing to copy. The
markup below is derived from Zag's connect layer plus the WCAG rows underneath it,
and is a departure from how every other family here was built.

- The drop area carries no `role`, no `tabindex` and no `aria-label`. Ark gives it
  `role="button"` and a tab stop, which announces a second control doing exactly
  what the browse button does. Dropping is a pointer enhancement; reader and
  keyboard users get the button. **2.5.7 Dragging Movements** is the row that
  licenses this: a drag-based function needs a single-pointer alternative, and the
  browse button is it.
- The field is `tabindex="-1"` and `aria-hidden="true"` inside `VisuallyHidden`.
  QDS leaves its input focusable, which makes two tab stops for one action.
- `itemclose` takes its `aria-label` from the consumer, the way toaster's does:
  the visible character is usually a cross, which a reader announces as "times".

## Known gaps

**A file dropped outside the drop area navigates the page to it.** Stopping that
needs a document-level `dragover`/`drop` listener, and authored `window:onX`
markup events are not a capability we have. Ark ships `preventDocumentDrop` for
this and defaults it on. Named here rather than papered over: it is a real hole in
the experience, not an oversight.

**Nothing announces that files arrived.** "3 files added" should reach a reader —
WCAG **4.1.3 Status Messages**. Neither QDS nor Ark ships a live region for it.
Adding one would mean either a hidden live region on the root or a documented
route through `toaster`, and neither is decided, so v1 ships without it.

**A removed row stays on the page.** The remove button reaches the right upload
and empties the store — the field's own list goes from three files to two, and
from one to none, which the suite measures — but the row it removed is still
rendered. A repeat over widget-scoped shared state adds rows as they arrive and
never takes one away. The same shape over page-scoped state is fine, which is why
toaster's dismiss row is green; this family cannot be page-scoped, because
`for={upload.fieldEl}` on the label is refused outside widget scope
(`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`). The two pinned `test.fails` rows in
`fileupload.browser.ts` turn red the day this closes.

**The list lives inside the root.** A component that reads the upload's state is
part of that upload's widget; one placed outside the root starts a second upload
of its own and repeats over its empty list. Every scenario therefore puts its
repeat in a small component *inside* `fileupload.root`. A construct may not be the
direct child of a component tag either, so the repeat opens in a plain element.

**Every scenario shares one browser file.** The family once held six, one per
scenario, on the belief that a compiled page installs its row-minting loader into
a single unqualified global and so two scenarios with a repeat could not share a
suite. Measured: all six scenarios import into `fileupload.browser.ts` and every
row that mints rows still mints them, twice over. There is no page-module
isolation constraint here.

**A row is a `div`, not an `li`.** A `<ul>` may hold nothing but `<li>`, and the
repeat needs an element to open in, so a list-semantics row would need a wrapper
that is not allowed there. The family declares no list role, the same as toaster.

## What a test lane cannot witness

A real drag carries files from outside the page and no automation driver can start
one, so the browser rows dispatch drag events with a `DataTransfer` the test
built. That does not reproduce the drag data store going protected when a real
drag ends. What it does prove is the part that was in doubt: the drop handler is a
lazily imported symbol, and on a freshly resumed served document the first gesture
is the one that pays for that import. The cold drop is green — the file is still
readable off the event after the import, in every run. That had never been
measured here before.

The operating system's picker is outside the document too, so the picker rows spy
on `showPicker` rather than opening anything.

## The cold first click is not settled

`SSR cold first click` passes whenever the fileupload lane runs on its own, and
fails every time the whole `ui` project runs. The failure is not slowness and not
the activation window: the spy records **zero** calls, and raising the wait from
one second to five changes nothing. The failure screenshot shows a clean page with
the Browse button in view and nothing over it, so the trusted click had a target.

What that leaves is the gesture never reaching the lazily loaded handler at all,
on a resumed document, under a full-project run. A programmatic `el.click()` on
the same page in the same run does reach it — only the real, trusted click does
not. The same run also reddens one popover row in a file this work never touched,
and that row passes on its own too, so whatever this is may not be the family's.

The fix belongs in dispatch, not in this family, and not in the label fallback:
when the click does arrive the browser still counts the gesture as active, so
`showPicker()` is allowed and the button shape is the right one. The row is
deliberately left unpinned rather than marked a known gap, because the owner set
it as a gate and a pinned row would hide it.

## Refused in v1

`maxFiles` / `maxFileSize` / `minFileSize` / `validate` / `transformFiles` — not
native attributes, and a consumer's `onChange` can reject; the same reasoning that
refused toaster's `itemaction`. `ClearTrigger` — needs a `clear` prefix nobody has
minted, and a consumer's own button calling `remove` per row does it today.
`ItemSizeText` and `ItemPreview` — a consumer holds `file.size` on the record and
can format it inline; a preview is `<img>` over a URL they mint. Clipboard paste.
`readOnly` — no shipped precedent, and `disabled` covers the real case.
