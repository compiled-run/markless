# Element-origin question: reader answer key (written before any reader ran)

Every reader sees one page, `q3/solutions/<label>.tsrx`, and no documentation. The six versions differ only in the
camera and PDF tags and their imports:

| Label | Camera tag | PDF tag | Where they come from |
| --- | --- | --- | --- |
| RQ | `<base.camera el={cam} />` | `<base.pdf … />` | `@markless/ui`, the `base` family (the current design) |
| MZ | `<camera el={cam} />` | `<pdf … />` | built into Markless, no import |
| FJ | `<native.camera el={cam} />` | `<native.pdf … />` | `@markless/ui`, the `native` namespace |
| LT | `<system.camera el={cam} />` | `<system.pdf … />` | `@markless/ui`, the `system` namespace |
| WY | `<cameraview el={cam} />` | `<pdfview … />` | `@markless/device` |
| KC | `<CameraView el={cam} />` | `<PdfView … />` | `@markless/device` (the blind writers' choice) |

The facts, the same for every version, are those in each writer sheet:

- **`tabs` and `base`.** `tabs.*` and `base.button` are parts from `@markless/ui`. They have behaviour and no styles. Tabs handles selection, arrow keys and focus. `base.button` with `pressed` is a toggle with its own pressed state. The author styles them from a stylesheet.
- **The camera and PDF elements.** Each is one box with no parts and no behaviour of its own. The author sizes and places the box, but the device draws what is inside, and the author cannot style that. The camera's state lives in the `cam` object from `camera()`. The page shown is set by the `page` prop.
- **On the website.** The camera element shows the browser's camera picture, after the browser asks permission. The PDF element shows the browser's PDF viewer.
- **`button` and `img`.** These are HTML elements. The author styles them, and `button` has the browser's own click behaviour.
- **Not HTML.** No version's camera tag is an HTML element.

## Scoring rule (6 points)

- **1a.** The `tabs` tags and `base.button` come from `@markless/ui`. 1 point if both are right.
- **1b.** The camera and PDF tags come from where the table says. For MZ: built into Markless or the framework itself, with no import. "A custom element" or "a web component" gets 0. "HTML" gets 0. For WY and KC: `@markless/device`. 1 point if both tags are right.
- **2.** The reader says the author cannot style the inside of the camera tag and the PDF tag, because it is drawn by the device, the system or the browser. Naming one with a sound reason and not contradicting the other is enough. 1 point.
- **3.** The reader says the camera and PDF tags carry no behaviour of their own: they are display boxes, and their state is in `cam` or props. The reader also gives `tabs` (or `base.button`) behaviour. 1 point. Saying the PDF tag "may scroll or zoom" is fine if the reader marks it as a guess and still calls it display-only.
- **4.** On the website: the camera tag shows a live picture from the browser camera, and the PDF tag shows the PDF page in the browser's viewer. 1 point if both are right. "Nothing", "blank", "unsupported" or "an error" gets 0.
- **5.** "No". 1 point. "Can't tell" gets 0.
- **Confidence.** Record question 6's number as given.

Pauses: also note, for each answer, any place where the reader says the camera tag could be confused with something else. For example, MZ's `<camera>` beside the imported `camera()` function, a `@markless/ui` family part, `element()` from `@markless/core`, an HTML tag, or a user component. Quote each one.

## Addendum: versions HV and GN, and questions 7 to 9

The owner added two versions after the first six had run. This addendum was written after the first HV reader had
started but before any HV answer had been read.

| Label | Camera tag | PDF tag | Where they come from |
| --- | --- | --- | --- |
| HV | `<video src={cam} />` | `<embed src={doc} />` | HTML elements, with a device object as their source |
| GN | one generic element named by the blind step, with `el={cam}` and `el={doc}` | the same element | see `variants-q3-ef.json` |

In HV and GN the PDF is a device object, `const doc = pdf('/guide.pdf')`, whose `page` the buttons change. In the first six versions the PDF element takes `page` as a prop. The camera is the same object in all eight.

Key changes for HV:

- **1b:** both tags are HTML elements (`video`, `embed`) that take the object from `@markless/device` as their source. 1 point if the reader says they are HTML elements fed by the device objects.
- **5:** "Yes", because it is the HTML `<video>` element. On the phones the system draws its view in that place. 1 point for "yes". "No" or "can't tell" gets 0.

The other points are as before.

### Questions 7 to 9

HV and GN readers answer these cold. Readers of the first six versions answer them in their second turn, after seeing every version.

- **7.** The camera element only shows the live picture. It does not record. 1 point.
- **8.** The shutter calls `cam.takePhoto()`. The photo comes from the camera object, not from the element, and it is shown in the `<img>` below. 1 point.
- **9.** Not scored. Record what the reader says they can and cannot tell.

Owner question to report on: does `<video src={cam}>` read as recording, or feel wrong "because it's a video, not a capture"? Quote every HV reader remark on this.
