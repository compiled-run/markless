```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, system } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
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
	let pages = state<number | null>(null);

	<div class="panel">
		<system.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages ?? '…'}</span>
			<button disabled={pages === null || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
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
- `base.button` takes no `onClick`, so I built the flip button as a toggle. Its `pressed` value follows `cam.facing === 'front'`, and its `onChange` calls `cam.flip()`. I'm assuming `cam.facing` updates live and resets `pressed`.
- The shutter and the Previous/Next buttons are plain `<button onClick>`, because `base.button` gives no way to handle a plain press.
- I assumed `system` is exported from `@markless/ui`, since it appears in that module's excerpt, and that `<tabs.root>` and `<system.camera>` work as JSX tags.
- I assumed the tabs need `onChange` to update `value` themselves, so the selected tab is held in state.
- I assumed a `<style>` block with a template-string child works inside the `.tsrx` component. A plain stylesheet setting `width: 100%` on `.fill` would do the same job.
- The page count shows "…" until `onLoad` reports it. I assumed `@if (photo)` narrows `photo` so `photo.url` type-checks.
- I assumed an async arrow handler that assigns the result of `await cam.takePhoto()` updates state correctly.
- I assumed the camera can stay mounted while its tab is hidden, since a tab's panel stays in the page.

## Website
- Camera preview: after the browser's camera permission prompt, the visitor sees the browser's live camera picture, stretched to the panel's width.
- PDF page: the visitor sees one page of `/guide.pdf` in the browser's built-in PDF viewer, at panel width.

Tools used: none (apart from reading the task file I was told to read)
