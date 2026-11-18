```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, system } from '@markless/ui';
import './media.css';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="camera-panel">
		<system.camera el={cam} class="fill-width" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
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
			<img class="fill-width" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="document-panel">
		<system.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill-width" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => (page = page - 1)}>Previous</button>
			<span>
				Page {page} of {pages ?? '…'}
			</span>
			<button disabled={pages === null || page >= pages} onClick={() => (page = page + 1)}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
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

```css
// file: pages/media.css
.fill-width {
	display: block;
	width: 100%;
}
.controls {
	display: flex;
	gap: 0.5rem;
	align-items: center;
}
```

Confidence: 3/5

## Guesses
- I assumed `tabs.root` is controlled: it shows the tab named by `value`, and I update my own state from `onChange`. I set `value` to `'camera'` at the start so the Camera tab shows first.
- I made the flip button a toggle (`pressed` = front camera is active) and call `cam.flip()` in `onChange`. The sheet says a `base.button` without `pressed` has no state, but it doesn't say how a plain button reports a click. It has no `onClick` prop.
- The shutter is a native `<button onClick>` with an async handler. I disable it until `cam.ready` is true, even though `takePhoto()` waits for the camera to be ready on its own.
- The component-level syntax `<system.camera el={cam} />` comes from the sheet's own example. I assumed `system` is imported from `@markless/ui`.
- I assumed `@if (photo)` narrows `photo` to a non-null `Photo` inside the block. I also assumed reading `cam.ready`, `cam.facing` and `cam.access` in the markup updates the page live.
- I put the styles in a CSS file imported by the page. I don't know whether Markless wants a `<style>` block in the `.tsrx` file instead, or how it handles CSS imports.
- The Camera panel stays in the page when hidden. I assumed the camera keeps running there and is released only when the page goes away.
- The page count shows "…" until `onLoad` fires.

## Website
- Camera preview: the browser asks for camera permission, then shows its own live camera picture in a box as wide as the panel. The page cannot style what is inside that box.
- PDF page: the browser's built-in PDF viewer shows one page of `/guide.pdf` in a box as wide as the panel, with the page's own Previous/Next buttons and "Page N of M" label below it.

Tools used: none
