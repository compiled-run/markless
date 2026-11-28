```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, cameraview, pdfview } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<cameraview el={cam} class="fill" />
		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="panel">
		<pdfview src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
		<style>
			{`
			.fill { display: block; width: 100%; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
			`}
		</style>
	</main>
}
```

Confidence: 3/5

## Guesses
- I guessed that the device elements are imported from `@markless/device` and written as lowercase tags (`<cameraview>`, `<pdfview>`), and that UI parts are written as member tags such as `<tabs.root>` and `<base.button>`.
- `base.button` has no `onClick` prop, so the flip button is a toggle. Its `pressed` value follows `cam.facing === 'front'`, and its `onChange` calls `cam.flip()`. I'm assuming that passing a value worked out from `cam.facing` keeps the toggle in step with the camera. The shutter is a plain `<button>`.
- I'm assuming an async handler can set state after an `await` (`photo = await cam.takePhoto()`).
- `tabs.root` shows nothing if `value` is left off, so I gave it a state that starts at `'camera'` and updated that state from `onChange`.
- I'm assuming that reading a camera field such as `cam.ready`, `cam.facing` or `cam.access` in the markup updates live, because the sheet says the fields are live.
- I'm assuming `@if (photo)` narrows away `null` inside the block. I'm also assuming the label can show `…` before `onLoad` reports the page count.
- I wrapped children in fragments to be safe, though the one-node rule may only apply to control-flow blocks.
- I guessed how to write a `<style>` block in a `.tsrx` file and that the `fill` class reaches the device elements' boxes. Any way of setting the width with a class would do the same job.
- Each panel stays in the page when its tab is hidden, so the camera keeps running while the Document tab is showing. I assumed that is acceptable.

## Website
- Camera preview: after allowing camera access in the browser's prompt, the visitor sees the browser's live camera picture, stretched to the full width of the panel.
- PDF page: the visitor sees the browser's own PDF viewer showing the current page of `/guide.pdf` at the full width of the panel, with its built-in viewer controls, which the page cannot style.

Tools used: none
