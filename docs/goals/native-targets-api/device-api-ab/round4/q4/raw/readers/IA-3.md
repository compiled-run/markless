1: `camera()`, `platform` and the `Photo` type come from `@markless/device`. All the tags below come from `@markless/ui` unless marked HTML.
- **Camera tag:** `ios.camera`, `android.camera` or `web.camera`, depending on the branch. These are the `ios`, `android` and `web` namespaces of `@markless/ui`. The `el={cam}` prop links the preview to the device camera object.
- **Filters sheet tag:** `ios.sheet`, `android.sheet` or `web.sheet`, from the same three namespaces.
- **`drawer.root`, `.trigger`, `.backdrop`, `.content`, `.title`, `.close`:** the `drawer` export. It looks like a compound component built from parts.
- **`base.button`:** the `base` namespace. It acts as a toggle button, with `pressed` and `onChange`.
- **`button` and `img`:** plain HTML, as are `main`, `p`, `h2`, `ul` and `li`.
- **Markless itself** supplies no tags here, only the blocks `@if`, `@else` and `@for`, plus `state` from `@markless/core`.

2: The website build takes the final `@else` branches, so a visitor gets `web.camera` and `web.sheet`. I'm guessing at what those are. `web.camera` is probably a browser camera preview, a `<video>` fed by the browser's camera access (getUserMedia). `web.sheet` is probably an HTML dialog or bottom-sheet panel. Whether `ios.camera`, `android.camera`, `ios.sheet` and `android.sheet` exist in the web build at all depends on what `platform` is. If it is fixed when the app is built, those branches are probably removed from the website. If it is checked while the page runs, they ship but never render. I lean towards removed, but that is a guess.

3:
- **Camera preview:** mostly the system. In the apps it is likely the phone's own camera view, and on the web the browser's video. The author only controls size and placement through `class="preview"`.
- **Filters sheet:** the system. Each platform gets its own sheet, presumably the native iOS sheet, the Android bottom sheet, and a web default. The author supplies only the content.
- **Comments drawer:** the author. It is built from unstyled parts with `class="comments"` and looks the same everywhere.

4: The sheet is one component per platform, chosen with `@if`. It probably has the native look, and the page controls whether it is open through the `choosing` state and `open`/`onChange`. Its content is written out three times. The drawer is a single component used on every platform and styled by the author. It manages its own open and closed state through `drawer.trigger` and `drawer.close`, it has a backdrop, and its content is written once.

5: Three places: the `<h2>Choose a filter</h2>` lines inside `ios.sheet` (line 39), `android.sheet` (line 46) and `web.sheet` (line 53).

6: `platform.ios` appears at lines 23, 34 and 37. It means "running as the iOS target", and it selects the iOS camera, the library note and the iOS sheet. `platform.android` appears at lines 25 and 44 and does the same for Android. The final `@else` covers everything else, meaning the website. The code is ambiguous about whether `platform.ios` means the iPhone app build or any iOS device, which would include Safari on an iPhone. My guess is that it means the app build, so only someone in the iPhone app sees "Photos also save to your library." Two clues support this. Saving to the photo library is a native-app ability, and a Safari visitor sent into the `ios.camera` and `ios.sheet` branches would get native-only components inside a browser. This is a guess.

7: Question 2: 3 out of 5. Question 6: 2–3 out of 5. To be sure I would need to know:
- Whether `platform.ios` and `platform.android` describe the build (iPhone app, Android app, website) or the device's operating system, so whether Safari on an iPhone counts as `ios`.
- Whether those values are fixed when the app is built, so unused branches and components are removed from each build, or checked while the page runs.
- What `web.camera` and `web.sheet` actually render.

Tools used: none
