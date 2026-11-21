```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="panel">
		<video class="fill" src={cam} />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					last = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img class="fill" src={last.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<embed class="fill" src={doc} />
		<div class="controls">
			<base.button
				disabled={doc.page <= 1}
				onClick={() => (doc.page = doc.page - 1)}
			>
				Previous
			</base.button>
			<span>Page {doc.page} of {doc.pages}</span>
			<base.button
				disabled={doc.pages === 0 || doc.page >= doc.pages}
				onClick={() => (doc.page = doc.page + 1)}
			>
				Next
			</base.button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; }
			embed.fill { aspect-ratio: 8.5 / 11; height: auto; }
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
- I used `pressed` and `onChange` on the flip button. The sheet gives `base.button` no `onClick`, and that pair is the only typed way to react to a press. It makes the flip button a toggle where "pressed" means the front camera. On Previous and Next I passed `onClick` to `base.button` anyway and assumed it is forwarded like a native button's. The sheet does not list it.
- The shutter is a plain `<button>`, not `base.button`, because the task only asked for the flip button to use `base.button`. Disabling it until `cam.ready` is true is my own choice, since `takePhoto()` waits for the camera to be ready anyway.
- I assumed the tags are written as `<tabs.root>`, `<base.button>` and so on, and that the `tabs` value is controlled through `value` and `onChange` with state.
- I assumed a `<style>` block inside the root element is allowed, and that assigning `doc.page` from a handler updates the page shown.
- `@if (last)` narrows `last` to `Photo` inside the block. I am not sure that narrowing works.
- The panel for the tab that is not showing stays in the page, so I assumed the camera keeps running while the Document tab is open.
- The `embed` needs a height, so I gave it an aspect ratio. I guessed the US Letter page shape.

## Website
- Camera preview: the browser's own camera picture in a `<video>` element, after the visitor answers the browser's permission prompt.
- PDF page: the browser's built-in PDF viewer in an `<embed>` element, showing the current page of `/guide.pdf`.

Tools used: none
