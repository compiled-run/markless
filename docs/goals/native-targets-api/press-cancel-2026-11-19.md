# A press a phone's browser takes for a scroll (measured 2026-11-19)

numberbox's step buttons start a hold on `pointerdown` and stop it on `pointerup`, `pointerleave` or `pointercancel`, and
open with `event.pointerType` to tell a mouse from a finger. Measured on this Mac with
`receipts/2026-11-19-press-cancel.html` (a button inside a box, on a page three screens tall, logging the pointer events,
`click` and `contextmenu` on both), raw events in `receipts/2026-11-19-press-cancel.json`:

| | iOS Safari 27.2 (simulator, Maestro) | Android Chrome 133 (AVD, `adb shell input`) |
|---|---|---|
| A tap | `pointerdown`, `pointerup`, `pointerout`, `pointerleave` on the button then on the box, `click` | the same (`click` before the leaves) |
| A drag down that starts on the button | `pointerdown`, `pointercancel`, `pointerout`, `pointerleave` on the button; no leave on the box was logged | `pointerdown`, `pointercancel`, `pointerout`, `pointerleave` on the button then the box |
| A drag sideways (the page does not scroll that way) | not measured cleanly: after a long press left a text selection, iOS logged `pointerdown` alone | as the drag down |
| A long press (1.5 s Android, 3 s iOS) | `pointerdown`, then `pointerup` and the leaves at the lift | `pointerdown`, `contextmenu`, `pointercancel`, then the leaves |
| `pointerType` | `touch` on every pointer event (`mouse` on the `click`) | `touch` on every event |

On Android the drag down also pulled the page to refresh, so the sideways drag ran on a reloaded page.

## What native hosts do to match

`event.pointerType` reads `touch` on a pointer event. A touch the platform takes for a scroll is `pointercancel` on the
element it went down on, and no `pointerup` follows: on iOS, when the page's pan recognizes the touch; on Android, when it
moves past the system touch slop (`ViewConfiguration.getScaledTouchSlop()`), as Chrome's own gesture detection does. After
an up or a cancel the runtime raises `pointerleave` on the element and each element it is inside, innermost first.

Not matched: Android Chrome's long press cancels the press with a `contextmenu`; the hosts send the lift as `pointerup`,
as iOS Safari does.
