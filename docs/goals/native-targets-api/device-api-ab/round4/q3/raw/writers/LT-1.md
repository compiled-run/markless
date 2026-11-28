```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base, system, tabs } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<system.camera el={cam} class="fill" />
		<div class="controls">
			<button onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill" src={photo.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<system.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>
				Page {page} of {pages}
			</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
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
- I used `base.button` for the flip button as a toggle: `pressed` is true when the front camera is in use, and `onChange` calls `cam.flip()`. The sheet gives `base.button` no `onClick`, so a plain `base.button` seemed to have no way to react to a press.
- The shutter is a native `<button onClick>`, because the task only requires `base.button` for the flip button.
- I assumed `<tabs.root>`, `<system.camera>` and the other dotted names work as JSX tags.
- I assumed that passing state as `value` and updating it in `onChange` is the right way to control which tab shows, and that `'camera'` as the starting value makes Camera show first.
- I assumed an async arrow function works as a handler that assigns state (`photo = await cam.takePhoto()`), and that state can be read straight from the `Camera` fields (`cam.facing`, `cam.access`).
- I assumed a `<style>` element with a template-string child is allowed inside the root element for the `fill` class. Markless may expect a separate stylesheet instead.
- I assumed `@if` with no `@else` is allowed, and that `state<Photo | null>(null)` narrows correctly inside `@if (photo)`.
- Before the PDF loads, the label reads "Page 1 of 0". I left it that way rather than hiding it.

## Website
- Camera preview: after the browser asks for camera permission and the visitor allows it, they see the browser's live camera picture filling the panel's width.
- PDF page: the visitor sees the browser's own PDF viewer showing the current page of `/guide.pdf` at the panel's width.

Tools used: none
