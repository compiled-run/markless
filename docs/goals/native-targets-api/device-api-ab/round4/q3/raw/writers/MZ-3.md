```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state('');

	<div class="camera-panel">
		<camera el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => {
					try {
						photo = await cam.takePhoto();
						failure = '';
					} catch (error) {
						failure = (error as Error).message;
					}
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera ({cam.facing})
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (failure) {
			<p>{failure}</p>
		}
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="document-panel">
		<pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
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
			.fill { display: block; width: 100%; height: auto; }
			camera.fill { aspect-ratio: 3 / 4; }
			pdf.fill { aspect-ratio: 1 / 1.414; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed={cam.facing === 'front'}`, and its `onChange` calls `cam.flip()`. I assumed the button's pressed look follows `cam.facing` after the flip.
- I assumed `tabs.root` is controlled through `value` plus `onChange`, and that `<tabs.root>` and `<base.button>` written as JSX member expressions are the correct way to use the parts.
- I assumed a `<style>` block with a template string inside the component is allowed. The guidance does not say how to add styles.
- I assumed I can style the `camera` and `pdf` boxes as tag selectors, and that `width: 100%` makes them fill the panel. I also assumed they need an explicit `aspect-ratio` to get a height.
- I assumed `@if (photo)` narrows `photo` to `Photo` inside the block.
- I assumed it is fine that `takePhoto()` waits while the camera tab is hidden: the panel stays in the page, so the camera may not be "ready".
- Before `onLoad` runs, the label shows "Page 1 of 0".
- I assumed the camera element shows the permission prompt by itself when it appears.

## Website
- Camera preview: after the browser asks for camera permission, the visitor sees the browser's live camera picture in the box, filling the panel width.
- PDF page: the visitor sees the browser's built-in PDF viewer showing page N of `/guide.pdf` in the box, with that viewer's own controls.

Tools used: none
