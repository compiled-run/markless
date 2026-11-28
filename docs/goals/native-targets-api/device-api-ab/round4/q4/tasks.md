# Platform-namespace question: writer task (same words for every variant)

Write one page, `pages/capture.tsrx` (you may split pieces into other components in the same file):

1. A live camera preview that fills the page width, a shutter button that takes a photo and shows the last photo
   below the preview, and a flip button, made with `base.button`, that switches between the front and back cameras.
2. A "Filters" button that opens the system sheet. The sheet has the heading "Choose a filter" and three choices:
   None, Mono and Warm. Choosing one closes the sheet and shows "Filter: Mono" (or the chosen name) under the preview.
3. A "Comments" button that opens a drawer made with the `drawer` family, with the title "Comments", a list of three
   short comments of your choice, and a Close button.
4. In the iPhone app only, the note "Photos also save to your library."
