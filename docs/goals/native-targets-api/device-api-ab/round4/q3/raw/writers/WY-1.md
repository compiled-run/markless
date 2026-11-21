```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, cameraview, pdfview } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="camera-panel">
		<cameraview el={cam} class="fill-width" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="camera-controls">
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
			<img class="fill-width" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="document-panel">
		<pdfview
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill-width"
		/>
		<p>Page {page} of {pages ?? '…'}</p>
		<div class="pdf-controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<button disabled={pages === null || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill-width { display: block; width: 100%; }
			.camera-panel cameraview { aspect-ratio: 3 / 4; }
			.document-panel pdfview { aspect-ratio: 1 / 1.414; }
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
- I guessed that the lowercase `<cameraview>` and `<pdfview>` tags need `cameraview` and `pdfview` imported from `@markless/device`. They may instead be built-in tags that need no import.
- `base.button` has no `onClick`, so I made the flip button a toggle button. `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I'm assuming that passing a live value to `pressed` keeps the button in sync after each flip.
- The shutter and the Previous and Next buttons are plain native `<button>`s with `onClick`. I'm assuming an async handler and a `try/finally` are allowed inside a handler.
- I guessed that a `<style>` block inside the `.tsrx` is a valid way to style things, and that the `class` on `cameraview`/`pdfview` lands on the box the device draws into. The 3:4 and A4 aspect ratios are my choice; the sheet doesn't give the boxes a natural height.
- I'm assuming `@if (photo)` narrows `photo` to a `Photo` inside the block, and that text with `{}` holes inside `<p>` works ("Page {page} of {pages ?? '…'}").
- Camera shows first because the starting tab value is `'camera'`. Content panels stay in the page when hidden, so the camera keeps running while Document is showing.

## Website
- Camera preview: the browser's live camera picture, shown after the browser asks for camera permission, stretched to the panel width. The visitor can't style it.
- PDF page: one page of `/guide.pdf` in the browser's own PDF viewer, at the panel width.

Tools used: none
