```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="panel">
		<camera el={cam} class="fill" />
		<div class="controls">
			<button onClick={async () => (last = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (last !== null) {
			<img class="fill" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => (page = page - 1)}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => (page = page + 1)}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill { display: block; width: 100%; }
			camera.fill { aspect-ratio: 3 / 4; }
			pdf.fill { aspect-ratio: 1 / 1.414; }
			.panel { display: flex; flex-direction: column; gap: 0.75rem; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
			[ui-selected] { font-weight: bold; }
		`}</style>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
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
	</main>
}
```

Confidence: 3/5

## Guesses

- **Using the parts:** I wrote the `tabs` and `base` parts as JSX member tags (`<tabs.root>`, `<base.button>`). The sheet only gives them as functions that return an element.
- **Flip button:** `base.button` has no `onClick`. Its only callback is `onChange`, and that only applies when you give it `pressed`. So I made flip a toggle button: `pressed` is tied to `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed this works because the live `facing` field then agrees with the toggle's new state.
- **Which tab shows:** I assumed the tabs only switch if I pass `value` and update it in `onChange`. I could not tell whether `root` keeps its own state after you give it a starting `value`.
- **Styling:** I put a `<style>` block inside the page and assumed it is allowed and reaches the built-in `<camera>` and `<pdf>` boxes. I also assumed `class` plus `width: 100%` is enough to size them, with an `aspect-ratio` for height.
- **Async click handler:** I assumed a click handler can be `async` and assign the awaited photo to state. I also assumed a rejected `takePhoto()`, such as when permission is denied, needs no handling here.
- **`@if` narrowing:** I assumed that inside `@if (last !== null)`, `last` is treated as a `Photo` so `last.url` type-checks.
- **Page count label:** Before `onLoad` runs, the label reads "Page 1 of 0". I assumed it is fine to show that until the count arrives.
- **Camera tab while hidden:** `tabs.content` keeps hidden panels in the page. I assumed the camera stays mounted and only reports `ready` while it is on screen.

## Website

- **Camera preview:** After allowing the browser's camera prompt, the visitor sees the browser's live camera picture stretched to the panel's width. Until then, or if they refuse, the box shows no picture.
- **PDF page:** The visitor sees the browser's own PDF viewer showing the current page of `/guide.pdf` at the panel's width, with the browser's built-in viewer controls, which cannot be styled.

Tools used: none
