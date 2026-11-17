# Requests from native-android-host

1. **A button's text on Android.** The contract maps `button` to `android.widget.Button` and a text node to a `TextView` child,
   but a `Button` is itself a `TextView` and cannot hold children. What I built (the conservative reading): the button's one
   text run is the Button's own text; a button with a second text run or an element child is a loud host error. With a style
   export, the text run's frame becomes the Button's padding. Please either confirm this in the table, or change the Android
   cell to "`FrameLayout` with `accessibilityClassName = android.widget.Button`, clickable, focusable" if buttons with icons
   or several runs are coming soon.
2. **Units in `dragon.native-style-export/0`.** The export says "device px", which holds for frames and `borderWidths`, but
   the counter's `font.size` (20 and 24) and `border-radius` lengths (12) read as CSS px. I multiply both by the export's
   `dpr`. Please have the export (or the contract) state the unit per field.
3. **The export carries `html` and `body` nodes** that are not in the payload. I add their frames into the root's position and
   ignore their writes. Please confirm that the document wrapper's paint (e.g. a `body` background) is not meant to reach the
   device, or name which node's background fills the screen.
4. **Pixel ratio.** The host refuses an export whose `dpr` differs from the device's by more than 0.001, since frames are
   device px. If the harness needs one export for several devices, the export would need CSS px frames instead.
