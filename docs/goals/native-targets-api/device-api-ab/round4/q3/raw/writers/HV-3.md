```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { tabs, base } from '@markless/ui';
import { camera, pdf, type Photo } from '@markless/device';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<video src={cam} class="fill" />
		<div class="controls">
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => (photo = await cam.takePhoto())}
			>
				Take photo
			</button>
			<base.button
				pressed={cam.facing === 'front'}
				disabled={cam.access === 'denied'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (photo) {
			<img class="fill" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<embed src={doc} class="fill" />
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>
				Previous
			</button>
			<span>Page {doc.page} of {doc.pages}</span>
			<button
				disabled={doc.pages === 0 || doc.page >= doc.pages}
				onClick={() => (doc.page = doc.page + 1)}
			>
				Next
			</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>
			.panel { width: 100%; }
			.fill { display: block; width: 100%; height: auto; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
		</style>
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
- **Writing the parts as JSX tags:** I guessed that the `tabs` and `base` parts are used as dotted tags (`<tabs.root>`, `<base.button>`) and that `children` are passed by nesting.
- **Showing the Camera tab first:** I did this by starting the `value` state at `'camera'` and updating it in `onChange`. I guessed that `root` needs both of these, and does not keep the selection itself.
- **Flip button:** `base.button` has no `onClick`. A plain button (no `pressed`) does not seem to call `onChange` either, so I made flip a toggle button. `pressed` reflects whether the front camera is active, and `onChange` calls `cam.flip()`.
- **Shutter handler:** I guessed that an async `onClick` that assigns state after `await cam.takePhoto()` works. I also guessed that `@if (photo)` narrows the type, so `photo.url` type-checks.
- **Live fields:** I guessed that reading `cam.access`, `cam.facing`, `doc.page` and `doc.pages` in markup updates on screen, since the sheet calls these fields "live". I also guessed that assigning `doc.page = ...` from a handler is allowed.
- **Camera in a hidden tab:** a hidden tab panel stays in the page, so the camera element may count as "on screen" while the Document tab shows, or it may not. I did not handle this.
- **Styles:** guessed that a `<style>` block inside the `.tsrx` works. Any stylesheet with the `.fill` rule would do.

## Website
- **Camera preview:** the browser's own `<video>` element showing the live camera picture, after the visitor allows camera access in the browser's permission prompt.
- **PDF page:** the browser's built-in PDF viewer in an `<embed>`, showing the current page of `/guide.pdf` at the panel's width.

Tools used: none
