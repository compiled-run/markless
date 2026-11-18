```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, cameraview, pdfview } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);
	let busy = state(false);

	<div class="media-panel">
		<cameraview el={cam} class="media-fill" />
		<div class="media-controls">
			<button
				disabled={busy}
				onClick={async () => {
					busy = true;
					try {
						last = await cam.takePhoto();
					} finally {
						busy = false;
					}
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img src={last.url} width={last.width} height={last.height} alt="Last photo" class="media-fill" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="media-panel">
		<pdfview src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="media-fill" />
		<div class="media-controls">
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
			.media-panel { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; }
			.media-fill { display: block; width: 100%; height: auto; }
			cameraview.media-fill { aspect-ratio: 3 / 4; }
			pdfview.media-fill { aspect-ratio: 1 / 1.414; }
			.media-controls { display: flex; gap: 0.5rem; align-items: center; }
		`}</style>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<>
				<tabs.list>
					<>
						<tabs.trigger value="camera">Camera</tabs.trigger>
						<tabs.trigger value="document">Document</tabs.trigger>
					</>
				</tabs.list>
				<tabs.content value="camera">
					<CameraPanel />
				</tabs.content>
				<tabs.content value="document">
					<DocumentPanel />
				</tabs.content>
			</>
		</tabs.root>
	</main>
}
```

Confidence: 2/5

## Guesses
- **Element names:** I guessed that the device and ui exports are written as lowercase tags (`<cameraview>`, `<pdfview>`) and dotted tags (`<tabs.root>`, `<base.button>`).
- **Flip button:** `base.button` has no `onClick`, so I made it a toggle (`pressed` follows the front camera) and call `cam.flip()` in `onChange`. I assumed that `pressed` being driven from `cam.facing` keeps the toggle in step with the camera.
- **Shutter button:** it is a plain `<button>` with an async `onClick`. I assumed native buttons and async handlers outside `@try` are allowed, because `takePhoto` is a promise and not a computed.
- **The `busy` flag:** it stops double presses. It is not required.
- **Photo display:** I assumed `@if (last)` narrows `last` to non-null inside the block.
- **Styles:** I assumed a `<style>` element with a template-literal child is allowed inside the root element. I also assumed `class` on `cameraview` and `pdfview` can be targeted with tag selectors like `cameraview.media-fill`. If not, the class alone still sets the width.
- **Fragments:** I wrapped multiple children in `<>…</>` because I wasn't sure whether components accept multiple children directly.
- **Page count:** I assumed `pages` is 0 until `onLoad` runs, so the label briefly reads "Page 1 of 0".
- **Hidden panel:** I assumed the camera keeps running while the Document tab is showing, since the panel stays in the page.

## Website
- **Camera preview:** the visitor sees the browser's live camera picture, after the browser's camera-permission prompt, filling the panel width.
- **PDF page:** the visitor sees `/guide.pdf` in the browser's built-in PDF viewer, at the chosen page and filling the panel width.

Tools used: none
