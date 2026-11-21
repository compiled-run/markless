# Text-field keys and paste on a phone's browser (measured 2026-11-18)

Planner ruling: the reference for keys and paste in a text field is a phone's browser with its on-screen keyboard; native
hosts match what it delivers. A hardware keyboard delivers key events, as before.

Measured on this Mac with `receipts/2026-11-18-soft-keyboard-events.html` (an `<input>` with autocorrect off, one with the
defaults, a `<textarea>`, and a last `<input>` after the buttons, each logging `keydown`, `keypress`, `keyup`,
`beforeinput`, `input`, `change`, `paste`, `composition*`, `focus` and `blur` in dispatch order). With `?prevent`, the
page calls `preventDefault()` on `keydown` for Enter and Backspace and on every `paste`.

- iOS: Safari 27.2 on the simulator `markless-mac` (iPhone 17), on-screen keyboard. Each key was pressed with Maestro's
  tap on the keyboard key, and paste through the field's edit menu.
- Android: Chrome 133 on the AVD `markless_mac` (Android 16, Gboard), on-screen keyboard. Each key was a touch on the
  Gboard key (`adb shell input tap`); paste went through the field's edit menu.

Raw events, per step and in dispatch order: `receipts/2026-11-18-soft-keyboard-events.json`.

| What the person does | iOS Safari | Android Chrome |
|---|---|---|
| A letter, digit or space | `keydown`/`keypress`/`keyup` with the character as `key` (`a`, `B`, `1`, `" "`) and its `code`; `input` `insertText` | `keydown`/`keyup` with `key` `Unidentified`, `keyCode` 229, no `code`; `input` `insertText` |
| Shift | `keydown`/`keyup` `Shift` | nothing |
| Backspace | `keydown`/`keyup` `Backspace`; `input` `deleteContentBackward` | the same, `code` empty |
| Backspace in an empty field | `keydown`/`keyup` `Backspace`, no `input` | the same |
| Return in a single-line field | `keydown`/`keypress` `Enter`, `change`, `keyup` | when the keyboard shows Go (no field after it): `keydown`/`keypress` `Enter`, `change`, `keyup`. When it shows Next (another field follows): no key event; focus moves to the next field (`change`, `blur`, then `focus` there) |
| Return in a `<textarea>` | `keydown`/`keypress` `Enter`; `input` `insertLineBreak`; `keyup` | a `keydown`/`keyup` pair with `Unidentified` first, then the same as iOS |
| Paste from the edit menu | `paste` (cancelable, `clipboardData` `text/plain`), then `input` `insertFromPaste` | the same |
| Autocorrect on space (`Teh` → `The `) | `input` `insertReplacementText` `The`, then `insertText` `" "`, under one `keydown` for space | `deleteContentBackward`, then `insertText` `The `, under one `keydown` `Unidentified` |
| `preventDefault()` on `keydown` Backspace | nothing is deleted; no `input` | the same |
| `preventDefault()` on `keydown` Enter | no `change`; in a `<textarea>` no line break | the same |
| `preventDefault()` on `paste` | nothing is inserted; no `input` | the same |

No `composition*` event arrived on either phone with the English keyboards.

## What native hosts do to match

- A text field's `keydown` handler runs for the keys above, with `event.key` as each phone's browser gives it: on iOS the
  typed character, `Backspace` or `Enter`; on Android `Unidentified` for typed text, `Backspace`, or `Enter` for the
  keyboard's action key when it is not Next.
- `event.preventDefault()` in that handler stops the deletion, the line break or the return key's `change` and implicit
  submit, as it does in both browsers.
- `paste` runs with the pasted text, and `preventDefault()` keeps it out of the field.
- Keys a phone's on-screen keyboard has no key for (arrows, Home, End, Page Up and Down, Escape, Delete, F2) never arrive,
  so the branches of a family's handler that test for them never run, as on the phone's browser.

How the hosts do it: on iOS the field's `insertText` (each typed character), `deleteBackward` (Backspace, in an empty
field too), `textFieldShouldReturn` and the text view's Return (Enter) and `paste(_:)`; on Android the input connection's
`commitText` and `setComposingText` (`Unidentified`), `deleteSurroundingText` (Backspace), the key events the keyboard
sends (Backspace in an empty field, Return in a `<textarea>`, or any hardware key, by its own name) and the action key
(Enter unless it is Next), and the edit menu's Paste.

## Where the hosts still differ from the measurement

- Android: a field with a `keydown` or return handler shows Go; Chrome shows Next when another field follows it, and Next
  sends no key and moves the focus.
- iOS: Return in a single-line field that is not prevented puts the keyboard away, as the host did before this change;
  Safari keeps the field focused.
- iOS: Shift sends no `keydown` (Safari sends one); `event.key` of the typed character is the same.
- Not measured: whether `preventDefault()` on a typed character's `keydown` keeps it out. The iOS host keeps it out; the
  Android host lets it in. No family prevents a typed character.
- A `paste` handler on an editable element that is not a text field (tokenbox's `contenteditable` `<div>`) is refused
  by name.

## Paste off a text field (measured 2026-11-19)

With `receipts/2026-11-19-paste-off-a-text-field.html` (two focusable, non-editable `<span role="spinbutton">`, as
datebox's and timebox's segments are, and an `<input>`), on the same simulator and AVD, with text on the clipboard:

| What the person does | iOS Safari | Android Chrome |
|---|---|---|
| Tap a segment | `focus`; no keyboard opens | `focus`; no keyboard opens |
| Long-press a segment | the text is selected; the menu offers Copy, Look Up, Translate, Find; no Paste | `contextmenu`; Copy, Share, Select all, Web search, and Read aloud under the overflow; no Paste |
| Long-press the text field | the menu offers Paste | the menu offers Paste |

No `paste` event reached a segment on either phone (`receipts/2026-11-19-paste-off-a-text-field.json`). On a phone a
non-editable element hears `paste` only from a hardware keyboard's Cmd+V or Ctrl+V while it has focus, so a native build
leaves that handler out with the keyboard-only warning, as it does the segments' `keydown`.
