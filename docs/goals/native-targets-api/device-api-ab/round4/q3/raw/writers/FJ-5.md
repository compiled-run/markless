```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, native } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="camera-panel">
		@if (cam.access === 'denied') {
			<p>Camera access was denied. Allow it in your settings to take photos.</p>
		}
		<native.camera el={cam} class="fill-width" />
		<div class="controls">
			<button
				disabled={busy}
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
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill-width" src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="document-panel">
		<native.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill-width" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => (page = page - 1)}>Previous</button>
			<span>{pages > 0 ? `Page ${page} of ${pages}` : 'Loading…'}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => (page = page + 1)}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill-width { display: block; width: 100%; }
			.document-panel .fill-width { aspect-ratio: 8.5 / 11; }
			.camera-panel native-camera, .camera-panel .fill-width { max-width: 100%; }
			.controls { display: flex; gap: 0.5rem; align-items: center; margin-block: 0.5rem; }
			[ui-pressed] { outline: 2px solid currentColor; }
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed` is tied to `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed the camera's `facing` field updates live, so the pressed state stays in step with it.
- The shutter, Previous and Next buttons are plain `<button>` elements with `onClick`, because `base.button` has no click callback. I assumed async handlers (`await cam.takePhoto()`) are allowed.
- I assumed `tabs.root` is controlled: it takes `value` from state and `onChange` writes it back. Starting the state at `'camera'` makes the Camera tab show first.
- I assumed the `ui` parts and `native.*` elements are written as dotted JSX tags (`<tabs.root>`, `<native.camera>`).
- I assumed a `<style>` element containing a template-literal string is allowed in `.tsrx`. I also guessed the PDF box needs a height of its own, so I gave it `aspect-ratio`, and that `class` alone sizes the native boxes.
- I assumed `@if` without `@else` is valid and that `@if (photo)` narrows `photo` to non-null inside the block.
- I guessed that `type Photo` can be imported, since it is exported on the sheet.
- I guessed the camera keeps running while its panel is hidden, because the panel stays in the page when its tab is not showing. I did not try to pause it.
- I assumed `pages` is 0 until `onLoad` runs, so the label shows "Loading…" until then.

## Website
- Camera preview: after the visitor allows camera access in the browser's permission prompt, they see the browser's live camera picture filling the panel width (blank if they deny access).
- PDF page: the visitor sees the browser's own PDF viewer showing the current page of `/guide.pdf` at the panel's width, with whatever controls that browser's viewer draws.

Tools used: none
