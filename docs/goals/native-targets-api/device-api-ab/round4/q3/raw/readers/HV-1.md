1: The three `tabs` tags (`tabs.root`, `tabs.list`, `tabs.trigger`, `tabs.content`) come from `@markless/ui`, through the `tabs` namespace. `base.button` also comes from `@markless/ui`. The tag that shows the camera is `<video>`, a plain HTML tag. Its source is `cam`, which comes from `camera()` in `@markless/device`. So the tag is HTML and the device package supplies what it plays. The tag that shows the PDF is `<embed>`, also plain HTML. Its source is `doc`, which comes from `pdf('/guide.pdf')` in `@markless/device`. `button` and `img` are plain HTML. No tag here comes from Markless itself. `@markless/core` only supplies `state`, and the `@if` block is template syntax, not a tag.

2: The author styles only the tags that have a class: `video.preview`, `embed.document` and `img.photo`. The `tabs` parts, `base.button` and the plain buttons have no class, so they get default or package styling. The author cannot style the inside of `<embed>`. The PDF viewer inside it is drawn by the browser or the operating system, and page CSS does not reach into it. The author can style its box: size, border and position. `<video>` is similar but weaker. The author can style its box and how the picture fits, but not the camera picture itself. On the iPhone and Android apps, I am guessing that both may be native views placed over the page, which would make them even more closed.

3: Tags with their own behaviour:
- The `tabs` parts keep track of the selected tab, and probably handle arrow keys and set the accessibility roles. That is my guess, based on how tab components usually work.
- `base.button` keeps a pressed state. It handles toggling and fires `onChange`.
- `<video>` plays the live camera feed.
- `<embed>` has the PDF viewer's own scrolling and zoom.
- `<button>` has HTML's built-in click, keyboard and disabled handling.

Tags that are a box with no behaviour: `div`, `p` and `img`.

4: Camera tag: the browser probably asks for camera permission, then shows the live picture in the `<video>`. Until then, or if permission is refused, `cam.ready` stays false. The visitor would see an empty or black box and a disabled Take photo button. That is a guess. Nothing in the code shows a fallback. PDF tag: the browser's built-in PDF viewer, showing `/guide.pdf`. That is also a guess. On a phone browser with no inline viewer, it might show a blank box or a download link.

5: Yes on the website, because `<video>` is a lowercase HTML tag name with no namespace, unlike `base.button` or `tabs.*`. On the iPhone and Android apps I can't tell. The compiler may turn it into a native camera view, and the code gives no hint either way.

6: Question 1: about 4 out of 5. The imports make the package origins clear. What I'm unsure of is whether `<video>` and `<embed>` stay HTML tags when their source is a device object. Question 5: about 3 out of 5. To be sure, I would need the documentation for `camera()` and `pdf()`, covering what they return and how it binds to `src`. I would also need to know how the native builds render `<video>` and `<embed>`.

7: It only shows the picture. There is no record call, no start or stop, and no `controls` on the tag. The only capture is `takePhoto()`, which takes a still image. `camera()` might also have a recording feature this page doesn't use. The code can't rule that out.

8: When the camera is ready, pressing Take photo calls `cam.takePhoto()`. That captures a still frame from the device's live camera, using whichever camera is active, front or back. The Front camera toggle switches between them with `cam.flip()`. The result is a `Photo` object, which is stored in the `photo` state. The `@if` block then shows it in `<img>`, using `photo.url`. Each new photo replaces the last one.

9: Partly.

Camera panel: I can tell there is a live preview, a Take photo button that is disabled until the camera is ready, and a Front camera toggle. The most recent photo appears below once one is taken. I can't tell the layout, the sizes, or what `base.button` looks like. That is set by the package's styling and the CSS classes, which I can't see.

Document panel: I can tell there is a PDF view, a "Page X of N" line, and Previous and Next buttons. Each button is disabled at its end of the document. I can't tell whether changing `doc.page` actually scrolls the embedded viewer. I assume it does. I also can't tell whether the viewer has its own toolbar.

Tabs: only the Camera tab shows at first, because of `value="camera"`. I can't tell whether the hidden panel is unmounted. If it is, switching tabs might stop the camera. That is a guess.

Tools used: none
