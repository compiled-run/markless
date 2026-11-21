```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, CameraView, PdfView } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failed = state('');

	<div class="panel">
		<CameraView el={cam} class="fill" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					try {
						photo = await cam.takePhoto();
						failed = '';
					} catch (error) {
						failed = (error as Error).message;
					}
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (failed) {
			<p>{failed}</p>
		}
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<PdfView src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<p>
			Page {page} of {pages}
		</p>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => (page = page - 1)}>Previous</button>
			<button disabled={pages === 0 || page >= pages} onClick={() => (page = page + 1)}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; }
			.preview-height { aspect-ratio: 3 / 4; }
			.controls { display: flex; gap: 0.5rem; }
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed` is true when the front camera is on, and `onChange` calls `cam.flip()`. I also guessed that passing `pressed` from `cam.facing` keeps the toggle in step with the camera.
- I guessed that `tabs.root` follows `value` as a controlled prop, so I update it from `onChange`. Starting it at `'camera'` makes Camera show first.
- I guessed that dotted tags like `<tabs.root>` and `<base.button>` are valid tag names in `.tsrx`.
- I guessed that `<style>` inside the component, with a template-string child, is an acceptable way to add the CSS. Plain class names in an external stylesheet would also work.
- I guessed that the `.fill` class with `width: 100%` sizes the device box, and that the box picks a sensible height by itself. The sheet does not say whether the preview or the PDF page needs an explicit height.
- I guessed that an async `onClick` handler is fine, and that `takePhoto()` can reject (for example when access is denied), so I catch the error and show its message.
- I guessed that `cam.access` and `cam.ready` can be read directly in markup and update live, because the sheet says "its fields are live".
- I guessed that a hidden tab's panel keeps its camera running, because the content "stays in the page" and the camera is released only when the component leaves the page. Nothing in this code stops the camera when the Document tab is showing.
- The label reads "Page 1 of 0" until `onLoad` fires.

## Website
- Camera preview: the visitor first gets the browser's camera-permission prompt. After they allow it, they see the live camera picture, stretched to the panel's width.
- PDF page: the browser's own PDF viewer shows `/guide.pdf` at the current page, filling the panel's width. Its look comes from the browser and cannot be styled.

Tools used: none
