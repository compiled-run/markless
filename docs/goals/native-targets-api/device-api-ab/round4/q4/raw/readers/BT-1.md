1: These are my guesses from the code alone.

- **Camera tag (`<camera el={cam}>`)**: HTML has no `<camera>` element. My guess is that it comes from `@markless/device`. The file imports `camera` from that package, calls `camera()` to get `cam`, and passes `cam` to the tag through `el`. The tag could also be a Markless built-in that happens to share the name, but the matching name and the `el={cam}` link point to the device package.
- **Filters sheet (`<sheet>`)**: nothing imports it, and HTML has no `<sheet>` element. So it is most likely a Markless built-in, probably a native modal sheet. This is a guess.
- **`drawer.root`, `drawer.trigger`, `drawer.backdrop`, `drawer.content`, `drawer.title`, `drawer.close`**: these come from `@markless/ui`, which the file imports explicitly.
- **`base.button`**: also from `@markless/ui`. It looks like a toggle button with a `pressed` state.
- **`button` and `img`**: plain HTML.

2: My guess is that both tags still exist in the website build, because the page is written once with no `@if` around either of them.
- **Camera**: on the website it most likely becomes a browser camera preview, probably a `<video>` element fed by `getUserMedia`. `cam.ready` would stay false until the visitor grants camera permission, or if they deny it or have no camera. That would disable "Take photo".
- **Sheet**: a visitor probably gets a web version of it, such as a dialog or a panel sliding up from the bottom, opened and closed through `open` and `onChange`.

Nothing in the code shows this fallback behaviour; I am inferring it.

3: Who decides the look:
- **Camera preview**: the system decides what is inside it (the live camera feed). The author decides its box, size and position through `class="preview"`.
- **Filters sheet**: the system decides. It has no class and no styling parts, and on the phone apps it is probably the platform's own native sheet. The author only supplies the content.
- **Comments drawer**: the author decides. It is built from separate parts (backdrop, content, title, close), the content has `class="comments"`, and it is a headless UI component. I guess it comes with only minimal default styling.

4: The Filters sheet is a single built-in tag that the page controls itself. Its open state lives in the page (`choosing`), it is opened by a separate button, it is closed in code after a choice, and its appearance is likely the system's.

The Comments drawer is a component assembled from parts. Its own `drawer.trigger` and `drawer.close` open and close it, so the page holds no state for it, and the author styles it. Native versus web is the likely underlying difference: the sheet is probably a real native sheet on iPhone and Android, while the drawer is web markup drawn by the UI package everywhere. That last point is a guess.

5: One place, the text inside the `<h2>` in the sheet. Nothing else in the file repeats it. The sheet has no title attribute, but if a native sheet showed a separate title bar, that would need a source the code doesn't show.

6: `platform` appears once in the template, as `@if (platform.ios)`. It means "running on iOS" and shows the note "Photos also save to your library" only there. The import line is the only other use.

The code can't say whether `ios` means the native iPhone app or any iOS device, which would include Safari on an iPhone. The note's wording, saving to the Photos library, only makes sense in the native app. So my guess is that only the iPhone app user sees it, and the Safari-on-iPhone visitor does not. But a naive implementation that reads the user agent would show it to both.

7: Question 2: about 2 out of 5. I would need to know how `<camera>` and `<sheet>` render, or what they fall back to, in the web build.

Question 6: about 2 out of 5. I would need the definition of `platform.ios`: does it mean the native app target or the device's operating system? Is there a separate flag for web?

I would also need to know whether `<camera>` and `<sheet>` are Markless built-ins or tags from the device package.

Tools used: none
