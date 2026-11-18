```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, cameraview, pdfview } from '@markless/device';
import type { Photo } from '@markless/device';
import { base, tabs } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let lastPhoto = state<Photo | null>(null);

	<div class="panel">
		<cameraview el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					lastPhoto = await cam.takePhoto();
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
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (lastPhoto) {
			<img class="fill" src={lastPhoto.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<pdfview
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill"
		/>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages}</span>
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
- Family parts are written as member tags (`<tabs.root>`, `<base.button>`), and the device elements as lowercase tags (`<cameraview>`, `<pdfview>`), as the sheet's comment shows.
- `base.button` has no `onClick` in its props. So the flip button is a toggle: `pressed` is tied to "front camera", and `onChange` calls `cam.flip()`. I assumed the toggle shows whatever `pressed` it is given rather than keeping its own copy.
- `tabs.root` needs `value` set for any tab to show, so I control it with state that starts at `'camera'`. I assumed `onChange` receives the clicked tab's value.
- The camera's fields (`ready`, `facing`, `access`) are reactive when read in markup, because the sheet says they are "live".
- The camera keeps running while the Document tab shows, because tab content stays in the page and the camera is only released when the component leaves the page.
- An async handler that assigns `lastPhoto = await cam.takePhoto()` updates the view.
- Styling with a `<style>` element that holds a template string inside the root element. The guidance does not say how page CSS is written.
- `@if (lastPhoto)` narrows the type so `lastPhoto.url` is allowed. Before `onLoad` fires the label reads "Page 1 of 0".
- `alt` and `disabled` work as normal HTML attributes on `<img>` and `<button>`.

## Website
Camera preview: the browser's live camera picture, shown after the visitor answers the browser's permission prompt, filling the panel's width.
PDF page: the browser's own PDF viewer showing one page of `/guide.pdf` at full panel width, with the browser's own controls, which cannot be styled.

Tools used: none
