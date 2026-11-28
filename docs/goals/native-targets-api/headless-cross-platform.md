# Can @markless/ui run headless on iOS and Android?

Assessment of `packages/headless/components` (46 family folders, including `base`) against the native targets being built on `cw/native-targets`. Read-only: no production code changed. The lead's contract note (`docs/goals/native-targets-api/contract.md` on `cw/native-targets`) was not on the remote when this was written, so this note is input to that contract, not a check against it.

## Summary (read this first)

**Verdict.** Yes, mostly. The library's design already fits native well. Every family imports only `@markless/core`. Families reach other elements only through `element()` handles. State is shown through `ui-*` attributes and ARIA. Overlays go through one framework primitive (the bare `overlay` attribute plus an `onDismiss` event), not the browser's `popover` or `<dialog>`: no family uses either. Those are exactly the seams a native host can implement once for every family.

What blocks it today is not the design. It is about 25 small places where family code reaches past the handle into browser-only globals:

- `document.activeElement`
- `window.setTimeout`
- `getComputedStyle(el).direction`
- `instanceof HTMLElement` and `instanceof DOMException`
- `new PointerEvent(...)` dispatched at the family's own elements
- `compareDocumentPosition`
- an expando property `__marklessOverlayFocusOrigin`

Each needs a portable replacement in `@markless/core` and a mechanical edit in the family. Beyond those edits, the host needs a set of real platform features, listed per family below.

Count by category (each family is placed in its hardest category):

- **13** work unchanged once the host supports the baseline.
- **8** need named host features that are real work, with no source change.
- **21** need a family source change. Most of those edits are one-line swaps; six are larger.
- **4** do not make sense on a phone: `hovercard`, `navbar`, `menubar` and `tokenbox`.

**First family to prove: `toggle`** (the switch). The plan is in section 4. It needs no overlay, no drag and no timers, yet it exercises role, checked state, the labelled-by relationship, disabled state and tap activation end to end.

### Decisions the owner must make

**Which "focus" `focus()` moves on a phone.** A phone has two focuses: the screen-reader cursor (VoiceOver/TalkBack) and hardware-keyboard focus. Families call `handle.focus()` to land a screen-reader user somewhere, for example the modal title. Recommendation: `focus()` moves both, and reading the focused element returns keyboard focus when a keyboard is attached, otherwise the screen-reader cursor. That is what every family's `focus()` call means on the web.

**How screen-reader gestures reach families.** On a phone, a VoiceOver user changes a slider with swipe up/down, not arrow keys. Recommendation: the host turns screen-reader actions into the key events families already handle:

- increment → `ArrowUp`
- decrement → `ArrowDown`
- escape gesture / Android back → the overlay `dismiss` event
- activate → `click`

Family source then stays unchanged. The alternative is adding action handlers to about 20 families.

**A small portable API in `@markless/core` instead of browser globals.** Recommendation: yes. Add portable reads for:

- the focused element
- layout direction
- render order of handles
- the overlay's "who had focus when this opened"

Also add a locale read (numberbox reads `document.documentElement.lang`) and pointer capture that cannot throw `DOMException`. Then make the edits in the 21 families that use these (listed in section 3). Otherwise every native host has to fake `window`, `document`, `HTMLElement` and `getComputedStyle`, which is a browser emulator by another name and would break the "real native views" ruling.

**Reading element positions synchronously inside handlers.** At least ten families measure positions synchronously inside handlers, for example `getBoundingClientRect()` inside a pointer-move handler: slider, pad, crop, colorpicker, resizable, drawer, carousel, ink, rating and gridlist. Recommendation: the native contract guarantees a synchronous read of the last committed frame during a handler. That read is cheap on the UI thread. Making it async means rewriting the drag logic of ten families. This also constrains where handlers run (see section 5).

**What happens when a native app imports a web-only family.** This covers `hovercard`, `navbar`, `menubar` and `tokenbox`. Recommendation: a build error that names the family to use instead (section 3). A silently degraded version would look like it works and fail screen-reader users.

**Researched defaults** (no decision needed unless you disagree):

- form `field` parts render nothing on native, because there is no form submission
- `hidden="until-found"` acts as plain `hidden`, because there is no find-in-page
- anchor placement uses a host placement engine fed by the same CSS
- tooltip opens on long-press and hover, through Android `setTooltipText` and iOS pointer hover

Details: sections 2 and 5.

---

## 1. Inventory: what each family relies on that only a browser has

### How this was gathered

The facts came from the yuku analyzer, not from text search. A scratch script (Appendix A) parsed and analyzed every non-test `.tsrx`/`.ts` file in each family folder with `@tsrx/yuku`. That is 193 files: everything except `*.browser.ts`, `*.sr.ts`, `*.nvda.ts`, `*.voiceover.ts`, `*.test.ts`, `*transcript*` and `scenarios/`. For each family, the script recorded:

- **Intrinsic tags.**
- **Attributes on intrinsic elements:** `role` values, `aria-*`, `ui-*`, `tabindex`, `hidden`, `overlay`, `type`, `inputmode`, `autocomplete`, `contenteditable`.
- **Event props.**
- **Globals:** the analyzer's unresolved references, split into value and type positions.
- **Member-expression properties from a fixed list of DOM API names:** focus, `getBoundingClientRect`, `setPointerCapture` and so on.
- **`element<T>()` type arguments.**
- **Imports.**
- **`<style>` contents:** each block parsed with `yuku-css`, recording properties, pseudo-classes, at-rules and functions.

The raw output is `headless-facts.json` beside this note.

**Limits of that scan:**

- **Name matches, not types.** The member list is matched by property name, not resolved type, so a hit like `width` may belong to a non-DOM object. It is a candidate list.
- **Fixed name list.** Names outside the list are not seen. I found `compareDocumentPosition` and `tabIndex` writes by reading `toolbar-walk.ts`, then added them to the list and re-ran.
- **Gaps were closed by reading.** Every source-change item in section 3 was confirmed by reading the cited line.

**Files read by hand:**

- `SPEC.md`, `CATALOG.md` (head)
- `toggle/toggle.tsrx`, `modal/modal.tsrx`, `modal/modal-focus.ts`, `popover/popover.tsrx` (parts), `base/visually-hidden.tsrx`, `toolbar/toolbar-walk.ts`, `checkbox/checkbox.tsrx` (trigger)
- `fileupload/fileupload-files.ts` (picker)
- the header of `packages/web/src/fns/overlay.ts`
- each line listed in the source-change table (section 3)

This is not a claim that every browser dependency has been found. It covers the files and names listed above.

### Baseline every family shares

**Imports.** All 46 families import only from `@markless/core`: `state`, `computed`, `shared`, `element`, plus the types `PropsOf`, `Seeded` and `Children`. There are no other packages.

**Element access.** Every element is reached through `element<HTMLxElement>()` handles. Relationships are written as handle values: `aria-labelledby={labelEl}`, `aria-controls={contentEl}`, `for={triggerEl}`. The framework, not the family, turns those into ids. That is good for native: a host can turn a handle reference straight into a native relationship.

**State.** State is visible as `ui-*` presence attributes and ARIA attributes.

**Activation.** Activation is `onClick` on `<button type="button">`.

**Overlays.** Overlays use the `overlay` attribute (and `overlay-hint` on tooltip and hovercard) with an `onDismiss` handler. `packages/web/src/fns/overlay.ts` implements the stack, Escape and outside-press reporting, and modal isolation, triggered by `aria-modal="true"` on an enlisted element. No family uses `popover=`, `<dialog>`, `showModal` or `showPopover`. The scan found no `popover` attribute and no `<dialog>` tag.

### Per-family facts

Abbreviations in this table only:

- **ev** = DOM events handled
- **globals** = browser globals referenced as values; JS built-ins such as `Math`, `Date` and `Intl` are omitted
- **DOM calls** = browser-only element or event members used
- **CSS** = properties in the family's `@layer markless` defaults; blank means none

| Family | Roles (literal or computed) | Notable ARIA | ev | Browser globals | DOM calls beyond `focus`/`key`/`preventDefault` | CSS defaults | Timers |
|---|---|---|---|---|---|---|---|
| accordion | region; implicit button, heading | expanded, controls, labelledby, disabled | click, keydown, beforematch | document | activeElement; `hidden="until-found"` | | |
| base | separator (unless decorative); button, label | pressed, orientation, hidden | click | | inline visually-hidden style (`clip-path: inset(50%)`, 1px, absolute) | | |
| buttongroup | group | pressed, disabled, labelledby | click, focus, keydown | | hidden `<input>` field | | |
| calendar | computed surface role; grid of buttons | expanded, haspopup, controls, live, pressed, invalid | click, keydown, focusin, dismiss | document | activeElement, contains, select | | |
| carousel | tablist, tab, group/tabpanel | roledescription, live, atomic, selected | click, focus(in), keydown, pointer down/move/up/over/out, wheel | window, getComputedStyle, performance | scrollLeft/Top, `animate()`, matchMedia, setPointerCapture, relatedTarget | | performance clock |
| checkbox | checkbox | checked (incl. mixed), invalid, describedby | click, keydown | | hidden `<input type=checkbox>` field | | |
| checklist | (composes checkbox) | | | | | | |
| collapsible | implicit button | expanded, controls, live | click, beforematch | | `hidden="until-found"` | | |
| colorpicker | slider, group, computed surface/thumb roles | value min/max/now/text, roledescription, expanded | click, input, blur, focusin, keydown, pointer*, dismiss | document, window | getBoundingClientRect, setPointerCapture, relatedTarget, `getComputedStyle().direction` | anchor-name/scope, position-anchor, touch-action, forced-color-adjust | |
| combobox | combobox, listbox, option, group, alert | autocomplete, expanded, multiselectable, selected | click, input, focus, keydown, keyup, pointerenter/over, dismiss | | scrollIntoView, click; hidden `<select>` field | | Date |
| crop | slider, group | value*, roledescription, live | focusin, keydown, pointer* | window | getBoundingClientRect, setPointerCapture, `getComputedStyle().direction` | inset*, touch-action, pointer-events, overflow | |
| datebox | group, spinbutton | value*, required, invalid | blur, keydown, paste | | keys typed into focusable `<span>` segments | | |
| drawer | dialog | modal, labelledby, describedby | click, focusin, keydown, pointer*, dismiss | window, HTMLElement | getBoundingClientRect, setPointerCapture, ownerDocument, `getComputedStyle().direction`; focus-origin expando | position, inset, translate, touch-action, overscroll-behavior, `:dir()` | |
| editable | group, alert | invalid, required | blur, click, focus, keydown | | input `select()`, isComposing | | |
| fileupload | (button, label) | hidden | change, click, drag enter/leave/over, drop | DataTransfer | `<input type=file>`, showPicker, dataTransfer.files | | |
| gridlist | grid, row, gridcell | multiselectable, selected | click, focusin, keydown | | getBoundingClientRect (page up/down) | user-select | |
| hovercard | (link + surface) | expanded, controls | focusin/out, pointerover/out, dismiss | document, window, PointerEvent, FocusEvent | dispatchEvent of synthetic events; `overlay-hint` | anchor-name/scope, position-area | setTimeout (hover intent) |
| ink | img | live, atomic, describedby | keydown, pointer* | window, document, Image | canvas getContext/toDataURL, setPointerCapture, `getComputedStyle().color`, SVG `path`/`line` | fill, stroke, touch-action, user-select | |
| menu | menu, computed item role | checked, expanded, haspopup | click, contextmenu, focusin/out, keydown, pointer*, dismiss | document, window, HTMLElement, PointerEvent, MouseEvent, CustomEvent | getBoundingClientRect, dispatchEvent, activeElement | anchor-name/scope, position-area, -webkit-touch-callout | setTimeout (submenu intent, long-press) |
| menubar | menubar, menu, menuitem | expanded, haspopup, orientation | click, contextmenu, focusin, keydown, pointerover, dismiss | document, HTMLElement, KeyboardEvent, MouseEvent | dispatchEvent, compareDocumentPosition, tabIndex writes | anchor-name/scope, position-area | |
| modal | dialog / alertdialog | modal, labelledby, describedby | click, pointerdown/up, dismiss | HTMLElement | focus-origin expando, `ownerDocument.body` | | |
| navbar | (nav, links) | current, expanded, controls | click, focusout, keydown, pointerover/out, dismiss | document, window, Node, PointerEvent, getComputedStyle | document-level pointermove listener, dispatchEvent, compareDocumentPosition, `getComputedStyle().display` | | setTimeout |
| numberbox | (input, buttons) | roledescription, live | input, blur, focus, keydown, pointer down/up/leave/cancel | document, window | setSelectionRange, selectionStart, `inputmode=decimal` | | press-and-hold repeat |
| otp | (input) | | focus, input | HTMLInputElement | setSelectionRange, `autocomplete=one-time-code`, `inputmode=numeric` | | |
| pad | slider, group | value*, roledescription, live | focusin, keydown, pointer* | | getBoundingClientRect, setPointerCapture | position, inset, pointer-events, touch-action | |
| pagination | (nav, links, buttons) | current, label | click | | | | |
| popover | dialog | expanded, haspopup, controls | click, dismiss | document | activeElement, contains | anchor-name/scope, position-area | |
| progress | progressbar | value* | | | | | |
| qr-code | img | | | | SVG `path` | | |
| radio-group | radiogroup | orientation, required | change, click, focus, keydown | | `<input type=radio>` field | | |
| rating | radiogroup, radio | posinset, setsize, checked | click, keydown, pointermove/leave | window | getBoundingClientRect, `getComputedStyle().direction` | position, user-select | |
| resizable | separator (focusable) | value*, controls, orientation | keydown, pointer* | window, HTMLElement | getBoundingClientRect, setPointerCapture, `getComputedStyle().direction` | clip-path, cursor, flex, overflow, touch-action | |
| select | listbox, option | expanded, haspopup, selected | click, keydown, dismiss | | click; hidden `<select>` field | | |
| slider | slider, group | value*, orientation | keydown, pointer* | window | getBoundingClientRect, setPointerCapture, `getComputedStyle().direction` | | |
| table | columnheader, computed grid/row/cell roles | sort, selected, multiselectable | click, focusin, keydown | | `<table>/<tr>/<td>/<th>` | user-select | |
| tabs | tablist, tab, tabpanel | selected, orientation, live | click, focus, keydown | | | | |
| taglist | group, alert, presentation | live, atomic, invalid | blur, click, focus, input, keydown, paste | | clipboardData, selectionStart/End, isComposing | | |
| textbox | (input, textarea, label) | invalid, describedby | input | | | | |
| timebox | group, spinbutton | value*, readonly | keydown, paste | | keys typed into focusable `<span>` segments | | |
| toaster | computed row role | live, relevant, atomic | click, focusin/out, pointerover/out | window, HTMLElement | document-level keydown hotkey, activeElement | | setInterval (expiry) |
| toggle | switch | checked, disabled, invalid, labelledby, describedby | click | | hidden `<input type=checkbox>` field | | |
| tokenbox | textbox, presentation, alert | multiline | beforeinput, composition start/end, input, keyup, paste | | `contenteditable`, Selection/Range API, `ownerDocument.defaultView` | white-space | |
| toolbar | toolbar | orientation | click, focusin, keydown | document, HTMLElement | compareDocumentPosition, tabIndex writes | | |
| tooltip | tooltip | describedby | blur, click, focus, pointerdown/over/out, dismiss | window, PointerEvent | dispatchEvent; `overlay-hint` | anchor-name/scope, position-area | setTimeout (hover intent) |
| tour | dialog | labelledby, describedby | click, focus, keydown, dismiss | HTMLElement | scrollIntoView, tabIndex writes, focus-origin expando | position-anchor, position-area, `anchor()`, `anchor-size()`, box-shadow | |
| tree | tree, treeitem, group | level, expanded | click, focusin, keydown | | click | | |

Notes:

- **value\*** means `aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext`.
- **Roving tabindex** (`tabindex={expr}` set to 0 or -1 per item) appears in buttongroup, calendar, carousel, checkbox, colorpicker, combobox, crop, datebox, drawer, fileupload, gridlist, ink, menu, menubar, modal, numberbox, pad, radio-group, rating, resizable, select, slider, table, tabs, timebox, toaster, toggle, tokenbox, toolbar, tour and tree.

---

## 2. Native equivalents, and who has to do the work

"Host" means the iOS and Android runtimes plus the compiler that lowers to them. "Derived" means the host or compiler can do it with no change to the family's source.

| Browser reliance | iOS (UIKit) | Android (Views) | Derived, or family change? |
|---|---|---|---|
| `role` + ARIA states | `accessibilityTraits` (button, header, selected, notEnabled, adjustable, link, image, staticText, updatesFrequently, iOS 17 toggle-button trait), `accessibilityValue` for checked, mixed and value text, `accessibilityLabel` | `AccessibilityNodeInfo` via an `AccessibilityDelegate`: `className` (Button, CheckBox, Switch, RadioButton, SeekBar, ProgressBar, EditText…), `setCheckable/Checked`, `setSelected`, `setEnabled`, `setHeading`, `setStateDescription`, `setRangeInfo`, `setCollectionInfo/ItemInfo`, roleDescription (androidx) | **Derived.** A closed mapping table keyed by role and state (section 5). `aria-roledescription` maps directly on Android and to a custom label suffix on iOS. |
| `aria-labelledby={handle}`, `<label for={handle}>`, `aria-label` | `accessibilityLabel` = text of the referenced nodes, kept current; the label view itself is hidden from VoiceOver to avoid reading it twice | `setLabeledBy(view)` (or contentDescription computed from text) | **Derived.** The relationship is already a handle, not an id string. |
| `aria-describedby={handle}` | `accessibilityHint` = referenced text | `setHintText` (API 26+) or tooltip text | **Derived.** |
| `aria-controls`, `aria-haspopup` | No equivalent; `haspopup` can add a hint ("opens menu") | No equivalent; can set roleDescription or hint | **Derived** (dropped, or turned into a hint). |
| `aria-expanded` | `accessibilityValue`/hint "expanded"/"collapsed" (iOS 18 adds an expanded-status property; to verify) | `setExpandedState`-style actions: `ACTION_EXPAND`/`ACTION_COLLAPSE` plus stateDescription | **Derived.** |
| `aria-live`, `aria-atomic`, `aria-relevant`, `role=alert` | `UIAccessibility.post(.announcement, …)` when the region's text changes; alert = high priority | `setAccessibilityLiveRegion(POLITE/ASSERTIVE)` | **Derived**, but needs a host diff of the region's text. |
| `aria-modal` on an enlisted overlay | `accessibilityViewIsModal = true` on the presented container | Separate `Dialog`/window, or `importantForAccessibility=noHideDescendants` on siblings, plus `setPaneTitle` | **Derived** inside the host's overlay primitive. |
| `aria-hidden`, `hidden`, `hidden="until-found"` | `accessibilityElementsHidden` / `isHidden` | `importantForAccessibility=noHideDescendants` / `GONE` | **Derived.** `until-found` acts as `hidden`; `beforematch` never fires. |
| Visually-hidden span (`base`) | Zero-size view still exposed to VoiceOver | Zero-size view, important for accessibility | **Derived.** Dragon recognises the 1px clip pattern, or the compiler marks `VisuallyHidden` output. |
| `onClick` on a button | `UIControl .primaryActionTriggered` / tap; VoiceOver double-tap = `accessibilityActivate` | `OnClickListener`; TalkBack double-tap = `ACTION_CLICK` | **Derived.** |
| `handle.focus()` | Move the VoiceOver cursor with `UIAccessibility.post(.layoutChanged/.screenChanged, argument: view)`; also `becomeFirstResponder`/focus system when a keyboard is attached | `sendAccessibilityEvent(TYPE_VIEW_FOCUSED)` / `performAccessibilityAction(ACTION_ACCESSIBILITY_FOCUS)` + `requestFocus()` | **Derived**, with an **owner decision** on which focus. |
| `document.activeElement`, `handle.contains(node)` | Focused element from the focus system / `UIAccessibility.focusedElement` | `findFocus()` / accessibility-focused node | Needs a **family change**: replace `document.activeElement` with a core read. `contains` stays (host tree containment). |
| focus / blur / focusin / focusout + `relatedTarget` | Focus-system `didUpdateFocus`, `accessibilityElementDidBecomeFocused` | `OnFocusChangeListener`, `TYPE_VIEW_ACCESSIBILITY_FOCUSED` events | **Derived.** The host synthesises bubbling focusin/focusout with a `relatedTarget` handle. |
| `tabindex` 0/-1 (roving) | Keyboard focus order / `focusGroupIdentifier`; VoiceOver ignores it and still visits every item | `focusable`, `nextFocus*`, `keyboardNavigationCluster` | **Derived.** Imperative `.tabIndex =` writes in toolbar, menubar and tour need the handle to accept them, or a family change to bind `tabindex` instead. |
| `onKeydown` with `event.key`, modifiers | `pressesBegan` with `UIKey` (`charactersIgnoringModifiers`, `keyCode`, modifier flags) | `onKeyDown(KeyEvent)` | **Derived.** The host normalises to web `key` names (`ArrowDown`, `Home`, `Escape`, `' '`, `Enter`). |
| Screen-reader adjust / escape / custom actions | `accessibilityIncrement/Decrement`, `accessibilityPerformEscape`, `accessibilityCustomActions` | `ACTION_SCROLL_FORWARD/BACKWARD`, `ACTION_SET_PROGRESS`, `ACTION_DISMISS`, system back | **Derived** if the owner accepts the key translation (decision 2). Otherwise every keyboard-only family needs new handlers. |
| `overlay` + `onDismiss` (Escape, outside press) | Container view in a window above the app (or presented view controller); hardware Esc, two-finger Z-scrub escape and a tap outside → `dismiss` | `PopupWindow`/`Dialog` window; back gesture, Esc and a touch outside → `dismiss` | **Host feature, real work:** one overlay stack implementation serves 13 families. |
| Anchor positioning CSS (`anchor-name`, `position-anchor`, `position-area`, `anchor()`, `anchor-size()`, `anchor-scope`) | Host placement: anchor frame → overlay frame, with fallbacks | Same | **Host feature, real work.** Dragon must carry these properties as data; the current styling plan errors on overlays until the native backend exists. |
| Pointer events + `setPointerCapture` + `getBoundingClientRect` in handlers | Touches stay with the view where they began (implicit capture); `convert(_:to:)` for coordinates | `requestDisallowInterceptTouchEvent(true)` on down; `getLocationOnScreen` | **Host feature, real work** (capture is a no-op that succeeds; geometry needs a synchronous read). **Family change** for the `instanceof DOMException` guards. |
| Hover (`pointerover`/`pointerout`) | `UIHoverGestureRecognizer` (iPad pointer, Vision); none on iPhone touch | `onHoverEvent` (mouse, stylus) | **Derived** where hardware hovers; on touch-only phones hover families need a long-press path or do not apply. |
| `getComputedStyle(el).direction` | `effectiveUserInterfaceLayoutDirection` | `getLayoutDirection()` | **Family change**, to a core direction read. |
| `matchMedia('(prefers-reduced-motion)')` | `UIAccessibility.isReduceMotionEnabled` | `ANIMATOR_DURATION_SCALE == 0` / `areAnimatorsEnabled` | **Family change**, to a core media read (the same fact CSS media queries need). |
| `Element.animate`, scrollLeft/Top, `scrollIntoView` | `UIScrollView.setContentOffset(animated:)`, `scrollRectToVisible` | `smoothScrollTo`, `requestRectangleOnScreen` | **Host feature** (scroll control). **Family change** for `animate()` in carousel. |
| `window.setTimeout`/`setInterval`, `Date.now`, `performance.now` | Run-loop timers in the native runtime | `Handler.postDelayed` | **Derived** for bare `setTimeout`/`Date.now`; **family change** to drop the `window.` qualifier. |
| `new PointerEvent(...)`/`dispatchEvent` to own handles | No equivalent: native has no synthetic DOM event bus | Same | **Family change**: call the shared handler function directly. |
| `compareDocumentPosition` (render order) | Retained view tree order | Same | **Family change**, to a core "handles in render order" read (SPEC already says position comes from render order). |
| Text input (`<input>`, `<textarea>`, `onInput`, `setSelectionRange`, `inputmode`, `autocomplete`, paste, composition) | `UITextField`/`UITextView`: `selectedTextRange`, `keyboardType`, `textContentType = .oneTimeCode`, `paste(_:)`, `markedTextRange` | `EditText`: `setSelection`, `inputType`, autofill hint `smsOTPCode`, `onTextContextMenuItem(paste)`, composing spans | **Host feature.** Value and input event are baseline; caret, paste and composition are real work. |
| Typing into a focusable non-text element (datebox/timebox segments) | Custom view adopting `UIKeyInput` + `keyboardType` so the software keyboard appears | `onCreateInputConnection` on a custom view | **Host feature, real work.** |
| `contenteditable` + Selection/Range (tokenbox) | No equivalent; closest is `UITextView` + `NSTextAttachment` | `EditText` + `ImageSpan` | **Does not translate** (section 3). |
| Canvas export (`getContext`, `toDataURL`, `Image`) | `UIGraphicsImageRenderer` | `Bitmap` + `Canvas` | **Host capability** + **family change** to call it. |
| SVG `path`/`line` | `CAShapeLayer` with a parsed path | `Path` + `Canvas`/`ShapeDrawable` | **Host feature** (an SVG path subset). |
| `<input type=file>`, `showPicker`, drag-and-drop `DataTransfer` | `UIDocumentPickerViewController`/`PHPickerViewController`; `UIDropInteraction` on iPad | `ACTION_OPEN_DOCUMENT`/Photo Picker; `OnDragListener` | **Host feature, real work**, plus permission declarations. |
| `<table>` layout | No table view in this sense; grid layout (Taffy) | Same | **Host feature** (table/grid layout). Accessibility: `UIAccessibilityContainerDataTable` / `CollectionInfo`. |
| Hidden form `field` parts (`<input type=hidden/checkbox/radio>`, `<select>` inside `VisuallyHidden`) | Nothing: there is no form submission | Nothing | **Derived** (researched default: render nothing). |
| `ui-*` attribute styling, `@layer markless`, `:dir()` | Dragon compiles to native style records keyed by attribute presence | Same | **Derived** through Dragon. Only the properties above (anchor, touch-action, user-select, overscroll-behavior, clip-path, fill/stroke, forced-color-adjust) need native meaning or a documented no-op. |

---

## 3. The four buckets

"Baseline host" means:

- role/state/label mapping
- tap → `click`
- `focus()` + focus events
- `tabindex` order
- hardware key events
- screen-reader actions translated to keys
- `hidden`/`aria-hidden`
- live regions
- plain text fields (value + `input` event)
- `ui-*` styling through Dragon

### Works unchanged once the baseline host exists (13)

| Family | Extra host features beyond baseline | Note |
|---|---|---|
| base | Visually-hidden lowering | `separator` maps to a static element |
| toggle | none | First proof (section 4) |
| checkbox | none | `mixed` → iOS value "mixed" / Android stateDescription |
| checklist | none | Composes checkbox |
| radio-group | none | |
| buttongroup | none | Imports toolbar's shared state; under a strict "no DOM globals in reachable code" check, toolbar's fix gates it |
| tabs | none | VoiceOver: tab trait on iOS, Android `className` TabWidget-like + `CollectionItemInfo` |
| tree | none | No iOS tree trait; level and expanded go in the value |
| pagination | Links (`<a>`) lowered to route navigation | |
| progress | none | Range info / `updatesFrequently` |
| collapsible | `until-found` → `hidden` | |
| textbox | Text field | |
| editable | Text field `select()` (select-all) | |

### Needs a host feature that is real work, no source change (8)

| Family | Host features beyond baseline | Note |
|---|---|---|
| select | Overlay stack | Placement is consumer CSS today |
| combobox | Overlay stack; scroll-into-view; text field | |
| gridlist | Synchronous geometry read (page up/down) | |
| table | Table/grid layout | Accessibility: data-table container / `CollectionInfo` |
| datebox | Software keyboard on a custom focusable view | Screen readers use increment/decrement |
| timebox | Same as datebox | |
| taglist | Paste text; composition state | |
| qr-code | SVG path subset | |

### Needs a family source change (21)

A family lands here if any edit is needed, however small. Most edits are one-line swaps to a portable `@markless/core` read. They are marked **mechanical**; the larger ones are marked **medium**. Most of these families also need host features.

| Family | Source change | Host features too |
|---|---|---|
| accordion | `document.activeElement` → core focused-element read (`accordion.tsrx:190`), mechanical | `until-found` → hidden |
| popover | `document.activeElement` (`popover.tsrx:118`), mechanical | Overlay stack, anchor placement |
| calendar | `document.activeElement` (`calendar.tsrx:471`), mechanical | Overlay stack (popup mode) |
| numberbox | `document.documentElement.lang` → core locale read (`numberbox-math.ts:33`); `window.setInterval` (`numberbox.tsrx:414`), mechanical | Caret/selection, `inputmode`, press-and-hold |
| otp | `instanceof HTMLInputElement` (`otp.tsrx:94`), mechanical | Caret selection, one-time-code autofill hint |
| fileupload | `showPicker` + `DOMException` guard (`fileupload-files.ts:159`) → host picker call, mechanical | File/photo picker, drag-drop on iPad/Android |
| toolbar | `compareDocumentPosition` → core render order; `instanceof HTMLElement`; imperative `.tabIndex =` → bound `tabindex` (`toolbar-walk.ts:17-53`), mechanical | — |
| modal | Focus-origin expando + `instanceof HTMLElement` + `ownerDocument.body` → a focus-origin fact from the overlay primitive (`modal-focus.ts`), mechanical once the core fact exists | Overlay stack, modal isolation |
| tour | Same focus-origin edit (`tour-focus.ts`); `instanceof HTMLElement` + `scrollIntoView` (`tour-anchor.ts`); `.tabIndex` writes, mechanical | Overlay stack, anchor placement incl. `anchor()`/`anchor-size()`, scroll-into-view |
| drawer | Focus-origin edit (`drawer-focus.ts`); direction read (`drawer-swipe.ts:50`); `DOMException` guard (`drawer-press.ts:65`), mechanical | Overlay stack, pointer drag, synchronous geometry |
| slider | Direction read (`slider-track.ts:13`); `DOMException` guard (`:26`); `window.`, mechanical | Pointer drag, synchronous geometry |
| pad | `DOMException` guard (`pad-math.ts:59`), mechanical | Pointer drag, synchronous geometry |
| crop | Direction read (`crop-math.ts:30`); `DOMException` guard (`:50`), mechanical | Pointer drag, synchronous geometry |
| resizable | Direction read (`resizable-walk.ts:17`); `DOMException` guard (`:29`); `instanceof HTMLElement` (`resizable.tsrx:113`), mechanical | Pointer drag, synchronous geometry, `clip-path` |
| rating | Direction read (`rating-walk.ts:41`), mechanical | Synchronous geometry; hover preview is optional on touch |
| colorpicker | Direction read (`colorpicker-math.ts:353`); `DOMException` guard (`:389`); `document.activeElement` (`colorpicker.tsrx:483`), mechanical | Overlay stack, anchor placement, pointer drag, synchronous geometry |
| toaster | Document-level keydown hotkey (`toaster-hotkey.ts:40`) → host key command; `window.setInterval`; `instanceof HTMLElement`, medium | Live regions with priority, hover/focus pause |
| tooltip | Synthetic `PointerEvent` dispatch (`tooltip.tsrx:91`) → direct call; `window.setTimeout`, medium | Overlay hint, anchor placement, long-press/hover (Android `setTooltipText` is the closest native analogue) |
| menu | Synthetic `PointerEvent`/`CustomEvent` dispatch (`menu.tsrx:347,678,723`, `menu-walk.ts:199`) → direct calls; `instanceof HTMLElement` (`:302`); `document.activeElement`; `window.setTimeout`, medium | Overlay stack, anchor placement, long-press context menu, synchronous geometry |
| carousel | `matchMedia` → core reduced-motion read (`carousel.tsrx:146`); `Element.animate` (`carousel-engine.ts:306`) and `getComputedStyle` (`:266`) → host scroll animation; `DOMException` guard (`:410`), medium: the scroll engine is browser-shaped | Scroll control, pointer drag |
| ink | Canvas export (`ink-stroke.ts:429-441`) → host snapshot capability; `getComputedStyle().color` (`ink.tsrx:249,260`) → computed-style read; `DOMException` guard, medium | SVG path, pointer drag with pressure, synchronous geometry |

### Does not make sense on a phone (4)

**hovercard.** It is a preview that opens when a mouse rests on a link, and touch has no resting pointer. Use `popover` behind an explicit button, or a context menu (`menu` with long-press). It also carries the synthetic event and timer edits if it is ever kept for iPad pointer use.

**navbar.** It is a website navigation bar with hover mega-menus and a "safe zone" that tracks the mouse across the page (`navbar-safe-zone.ts` listens to `pointermove` on `document`). Native apps navigate with routes shown as a tab bar or stack. Use routes with `tabs`, `menu`, or plain links.

**menubar.** It is a desktop application menu bar. On iPad and Mac the system owns the menu bar (`UIMenuBuilder`); on phones there is none. Use `menu` or `toolbar`.

**tokenbox.** It is built on `contenteditable` with Selection/Range, which has no native counterpart; a rewrite on attributed text views would be a new family. Use `taglist`, which covers the token-entry case with a plain text field.

---

## 4. First family to prove: `toggle`

**Why toggle.**

- It is the smallest family with real semantics: role `switch`, checked state, a label linked by handle, a description, disabled state and tap activation.
- It has no overlay, drag, timers, `<style>` or browser globals.
- Its keyboard behaviour is the native button's own activation.
- The optional `field` part is left out on native.
- It reads toolbar's shared state, but `toolbar.mounted` stays unset outside a toolbar, so no toolbar code runs.

### Component usage (`.tsrx`)

```tsx
import { state } from '@markless/core';
import * as Toggle from '@markless/ui/toggle';

export default function WifiSetting() @{
	let on = state(false);
	<Toggle.root checked={on} onChange={(next) => (on = next)}>
		<Toggle.label>Wi-Fi</Toggle.label>
		<Toggle.trigger testid="wifi-switch">
			<Toggle.thumb />
		</Toggle.trigger>
		<Toggle.description>Join known networks automatically</Toggle.description>
	</Toggle.root>
	<p testid="wifi-status">{on ? 'Wi-Fi is on' : 'Wi-Fi is off'}</p>
}
```

`testid` stands for whatever test-identifier attribute the lead's contract settles on. It should lower to `accessibilityIdentifier` (iOS) and `resource-id`/view tag (Android). The test-infrastructure note recommends stamping identifiers from locator metadata.

### What Maestro can see

**iOS: checked.** I ran `maestro hierarchy` (Maestro 2.12.1) against the iOS Settings app on an iPhone 17e simulator on this machine. Every iOS node exposes exactly these attributes:

`accessibilityText`, `title`, `value`, `text`, `hintText`, `resource-id`, `bounds`, `enabled`, `focused`, `selected`, `checked`

`accessibilityText` is the VoiceOver label, `hintText` the hint, `value` the accessibility value and `resource-id` the identifier. **No role or trait is exposed.** Maestro can prove label, hint, value, checked, enabled and identifier, but not "this is a switch". The role needs a second check: an XCUITest assert on `elementType == .switch`, or a host-side accessibility dump. I could not navigate into a screen with a switch (taps on Settings rows did not navigate in that run), so how Maestro derives `checked` from a switch's value is **unverified**. The proof must check it first.

**Android: not checked.** Android was not checked (no `adb` or emulator on this machine). Maestro's Android hierarchy reportedly carries the same attribute names, with `checked` from `AccessibilityNodeInfo.isChecked`. **Unverified.**

### Maestro flow

```yaml
appId: dev.markless.proof.toggle
---
- launchApp
# Semantics as VoiceOver/TalkBack see them
- assertVisible:
    id: "wifi-switch"
    text: "Wi-Fi"            # label comes from Toggle.label through aria-labelledby
    enabled: true
    checked: false
- assertVisible:
    id: "wifi-switch"
    hintText: "Join known networks automatically"   # aria-describedby → hint
- assertVisible: "Wi-Fi is off"
# The label itself must not be a second accessibility element
- assertNotVisible:
    text: "Wi-Fi"
    id: ""                    # adjust: assert only one element carries the label
# Activate
- tapOn:
    id: "wifi-switch"
- assertVisible:
    id: "wifi-switch"
    checked: true
- assertVisible: "Wi-Fi is on"
# Tapping the label toggles too (label `for`)
- tapOn: "Wi-Fi"
- assertVisible:
    id: "wifi-switch"
    checked: false
```

The proof also needs two checks that Maestro cannot express:

- **Role:** on iOS, an XCUITest asserts `app.switches["wifi-switch"].exists` and that its value is "0"/"1". On Android, an Espresso or UiAutomator test asserts `className == android.widget.Switch` (or role description "switch") and `isCheckable`.
- **Screen-reader activation:** the iOS test calls the element's activate action, not a coordinate tap; the Android test performs `ACTION_CLICK` on the node. Both then assert `checked` flipped. That shows a screen-reader double-tap reaches `onClick`.

A disabled variant (`<Toggle.root disabled>`) asserts `enabled: false`, and that a tap leaves `checked` unchanged.

### What must exist in the hosts first

- Lowering of `div`, `span`, `label`, `button`, `p` and text to retained views, with `children` projection through the family's parts.
- `shared(..., { scope: 'subtree' })` instance resolution and `element()` handles on native nodes.
- Handle-valued attributes: `aria-labelledby={handle}` → label text, `aria-describedby={[...handles]}` → hint text, `for={handle}` → tap forwarding plus label hidden from the screen reader.
- The role/state mapping for `switch`: `aria-checked`, `aria-disabled`/`disabled`, `aria-invalid` (value suffix or error hint).
- `onClick` from tap and from the accessibility activate action.
- Prop updates flowing back: `checked` from `onChange` re-renders `ui-checked` and the status text.
- The test-identifier attribute.
- `ui-checked` reaching Dragon styles, so the thumb can move. This is visual only and not required for the accessibility proof.

**Next proof after toggle: `collapsible`.** It adds `hidden`, `aria-expanded` and a live region. **Then `modal`.** It adds the overlay primitive, modal isolation, `dismiss` from the escape gesture and Android back, and the focus-origin edit.

---

## 5. What the native contract must carry so headless works

Input for the lead, in the order a family depends on it.

**1. Roles: a closed set, each with an iOS and an Android mapping.** Roles used by families today (literal or computed):

alert, alertdialog, checkbox, columnheader, combobox, dialog, grid, gridcell, group, img, listbox, menu, menubar, menuitem (+ checkbox/radio variants via computed `itemRole`), option, presentation, progressbar, radio, radiogroup, region, row, separator, slider, spinbutton, switch, tab, tablist, tabpanel, textbox, toolbar, tooltip, tree, treeitem

Plus the implicit roles of the tags used: button, heading (`h2`, `h3`), link (`a`), navigation (`nav`), table/row/cell (`table`, `tr`, `td`, `th`), textbox (`input`, `textarea`), status (`output`), label. An unknown role should be a build error, not a silent drop.

**2. States and properties, each with a mapping:**

- checked (true/false/mixed), selected, pressed, expanded, disabled, invalid, required, readonly, current
- modal; hidden (and `hidden` attribute, including `until-found`)
- the value range: valuemin/valuemax/valuenow/valuetext
- level, posinset/setsize, orientation, multiselectable, haspopup, autocomplete, sort, roledescription
- live (polite/assertive) with atomic and relevant; multiline

**3. Relationships whose values are handles, not ids:** labelledby (a list), describedby (a list), label-for, controls. The host resolves each to native label, hint or labeledBy, keeps it current when the referenced text changes, and hides a label element from the screen reader when it already labels its target.

**4. Focus:**

- Programmatic `focus()` on a handle, with defined meaning for the screen-reader cursor and keyboard focus (decision 1).
- A portable read of the focused element (replacing `document.activeElement`).
- `handle.contains(node)`.
- focus/blur/focusin/focusout events with a `relatedTarget` handle or null.
- Keyboard focus order from `tabindex` (0, -1, absent), including updates.
- Focus must land after a write that reveals the target, in the same handler (the SPEC's Timing rule: no frame polling).

**5. Input events:**

- `click` from a tap and from the accessibility activate action.
- `keydown`/`keyup` with web `key` names and modifier flags from hardware keyboards.
- The screen-reader action → key translation (decision 2).
- Pointer events with `pointerId`, `pointerType` (touch/pen/mouse), `button`, `pressure`, client coordinates; implicit capture, plus a `capture` call that never throws.
- `contextmenu` from a long-press.
- Hover only where hardware hovers.

**6. Overlay primitive:** the `overlay` / `overlay-hint` marks:

- enlist when `hidden` turns false
- `dismiss` with reason `escape` (hardware Esc, iOS escape gesture, Android back) or `outside-press` (with the pressed node)
- hint exclusivity and superseding
- modal isolation from `aria-modal`, with reference counting
- scroll lock
- the focus origin at enlist time exposed as a portable fact (replacing the expando)
- authored parentage kept for styling and events after the host re-parents the view into a top layer

**7. Geometry and environment:**

- A synchronous read of the last committed frame of a handle during a handler (decision 4).
- Layout direction.
- Reduced-motion and other media facts shared with Dragon's media queries.
- Handles in render order (replacing `compareDocumentPosition`).

**8. Locale and timers:** a locale read (replacing `document.documentElement.lang`);  bare `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval` and `Date.now` in the handler runtime. No `window`/`document` globals.

**9. Text input:**

- value + `input` event
- caret/selection get and set
- `select()`
- paste with text
- composition state
- `inputmode` → keyboard type
- `autocomplete` → content type / autofill hint (`one-time-code`)
- a software keyboard for a focusable non-text element (datebox and timebox segments)

**10. Styling:** `ui-*` presence attributes and ARIA attributes as Dragon selector inputs; `@layer markless` defaults below consumer rules; native meaning or a documented no-op for `anchor-*`/`position-area`/`anchor()`, `touch-action`, `user-select`, `overscroll-behavior`, `clip-path: inset()`, `fill`/`stroke`, `forced-color-adjust`, `-webkit-touch-callout`.

**11. Test identity:** one attribute that lowers to `accessibilityIdentifier` and Android `resource-id`, so Maestro and XCUITest can address parts without reading labels.

**12. A build check:** a family or app module reachable on a native target that references a browser-only global (`window`, `document`, `HTMLElement`, `DOMException`, DOM event constructors, `getComputedStyle`, `matchMedia`) fails the build with the portable replacement named. The analyzer already reports these as unresolved references; the scan in Appendix A is the shape of that check.

**Where handlers run matters for item 7.** Families read geometry and focus synchronously inside handlers. If handlers run as data on the UI thread, these reads are cheap. If they run in a JS engine on another thread, every such read is a blocking cross-thread call. The pointer-heavy families (slider, pad, crop, colorpicker, resizable, drawer, carousel, ink) do this on every pointer move.

---

## Appendix A: the scan

Run from the repo root with `node scan.mjs packages/headless/components/src out.json`, with `<repo>` replaced by the checkout path. It uses the repo's own `@tsrx/yuku` analyzer and `yuku-css` parser.

```js
import { analyze } from '<repo>/node_modules/.pnpm/@tsrx+yuku@0.8.0/node_modules/@tsrx/yuku/dist/index.js';
import { parse as parseCss } from '<repo>/node_modules/.pnpm/yuku-css@0.1.0/node_modules/yuku-css/dist/index.js';
import { walk as walkCss } from '<repo>/node_modules/.pnpm/yuku-css@0.1.0/node_modules/yuku-css/dist/ast.js';
// For each family folder: every .tsrx/.ts except browser/sr/nvda/voiceover/test/transcript files and scenarios/.
// analyze(source) → module; record:
//   module.unresolvedReferences  → globals (value position) and DOM types (type position)
//   module.imports               → package and cross-family dependencies
//   walk JSXOpeningElement       → intrinsic tags; role/aria-*/ui-*/tabindex/hidden/overlay/type/... attributes; on* events
//   walk JSXStyleElement         → yuku-css parse; Declaration.property, pseudo-classes, at-rules, functions
//   walk MemberExpression        → property names in a fixed DOM-API list (name match, not type-resolved)
//   walk CallExpression element<T>() → handle element types
```

The full output is `headless-facts.json` beside this note.
