You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks.

The app is built from one codebase as an iPhone app, an Android app and a website. `@markless/device` is a package of device features and `@markless/ui` a package of components. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { base, tabs } from '@markless/ui';
import { camera, pdf, type Photo } from '@markless/device';

function CameraPanel() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<div>
		<video src={cam} class="preview" />
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div>
		<embed src={doc} class="document" />
		<p>{`Page ${doc.page} of ${doc.pages}`}</p>
		<button disabled={doc.page <= 1} onClick={() => doc.page--}>Previous</button>
		<button disabled={doc.page >= doc.pages} onClick={() => doc.page++}>Next</button>
	</div>
}

export default function Media() @{
	<tabs.root value="camera">
		<tabs.list>
			<tabs.trigger value="camera">Camera</tabs.trigger>
			<tabs.trigger value="document">Document</tabs.trigger>
		</tabs.list>
		<tabs.content value="camera">
			<CameraPanel />
		</tabs.content>
		<tabs.content value="document">
			<DocumentPanel />
		</tabs.content>
	</tabs.root>
}
```
=== END CODE ===

Questions:
1. Where does each tag come from: HTML, Markless itself, or a package (which)? Answer for the `tabs` tags, `base.button`, the tag that shows the camera, the tag that shows the PDF, `button` and `img`.
2. Which of these tags does the page's author style? Is there any whose inside the author cannot style? Which, and why?
3. Which tags carry behaviour of their own (state, keyboard or events they handle themselves), and which are a box with none?
4. A visitor opens this page on the website. What do they see for the camera tag and for the PDF tag?
5. Is the tag that shows the camera an HTML element? Answer yes, no, or can't tell, and say why.
6. How sure are you of your answers to questions 1 and 5 (1–5)? What would you need to know to be sure?
7. Does the element that shows the camera record video, or only show the picture? How can you tell?
8. What does the Take photo button do, and where does the photo come from?
9. From the markup alone, can you tell what is on screen in each panel? Say what you can and cannot tell.

Output format: lines `1:` … `9:`; end with `Tools used: none`.
