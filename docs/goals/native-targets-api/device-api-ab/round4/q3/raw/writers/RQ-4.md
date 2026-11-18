```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="media-panel">
		<base.camera el={cam} class="media-fill" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="media-controls">
			<button
				disabled={!cam.ready || busy}
				onClick={async () => {
					busy = true;
					try {
						photo = await cam.takePhoto();
					} finally {
						busy = false;
					}
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
		@if (photo) {
			<img class="media-fill" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="media-panel">
		<base.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="media-fill"
		/>
		<div class="media-controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function MediaPage() @{
	let tab = state('camera');

	<main>
		<style>{`
			.media-panel { display: flex; flex-direction: column; gap: 0.75rem; }
			.media-fill { display: block; width: 100%; }
			.media-controls { display: flex; gap: 0.5rem; align-items: center; }
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
- How to style the page. The guidance doesn't say where CSS goes, so I put a `<style>` element inside the root element. A real project might use a separate stylesheet instead.
- The flip button. `base.button` has no click prop, so I made it a toggle: `pressed` is true when the front camera is on, and `onChange` calls `cam.flip()`. I assumed the toggle follows `pressed` back from `cam.facing`.
- The shutter. I used a native `<button onClick>`, because a plain `base.button` has no click callback. I assumed an `async` handler that assigns state works.
- The camera keeps running while the Document tab shows, because the sheet says hidden tab content stays in the page.
- I assumed `cam.ready`, `cam.access` and `cam.facing` can be read directly in the template and stay live, since the sheet says "its fields are live".
- `pages` starts at 0, so the label reads "Page 1 of 0" until `onLoad` fires.
- I assumed `tabs.root` with `value` and `onChange` is the controlled pattern, with a callback that takes one parameter.

## Website
- Camera preview: the browser's own camera picture, filling the panel width, after the visitor allows camera access at the browser's permission prompt.
- PDF page: one page of `/guide.pdf` in the browser's built-in PDF viewer, filling the panel width. Its look comes from the browser and can't be styled.

Tools used: none
