```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, View, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let lastPhoto = state<Photo | null>(null);

	<div class="panel">
		<View el={cam} class="fill-width" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					lastPhoto = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				{cam.facing === 'front' ? 'Use back camera' : 'Use front camera'}
			</base.button>
		</div>
		@if (lastPhoto) {
			<img class="fill-width" src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<View el={doc} class="fill-width" />
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>Previous</button>
			<span>Page {doc.page} of {doc.pages}</span>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => (doc.page = doc.page + 1)}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill-width { display: block; width: 100%; }
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
- `base.button` has no `onClick` prop. To make the flip button react to a press, I made it a toggle: `pressed` is true when the front camera is on, and its `onChange` calls `cam.flip()`. I'm not sure a toggle is the intended way to use it.
- The shutter and the Previous/Next buttons are plain `<button onClick>` elements, since the sheet gives no other way to handle a press.
- I assumed the camera and the PDF keep running while their tab is hidden, because a tab's content part stays in the page. The sheet doesn't say whether the camera pauses when its tab isn't showing.
- I assumed the page-count label renders correctly as text plus `{}` expressions, and that it reads "Page 1 of 0" until the file loads.
- I assumed `type Photo` can be imported from `@markless/device` and that a `<style>` block inside the component is allowed. The `ui-*` styling of the tabs is left at its defaults.
- I assumed `camera()` with `facing: 'back'` is a sensible default, and that `cam.ready` can be read in `disabled` and will update live.

## Website
- Camera preview: after allowing camera access, the visitor sees the browser's live camera picture (a video), as wide as the panel. It can't be styled inside.
- PDF page: the visitor sees `/guide.pdf` in the browser's own PDF viewer, as wide as the panel, showing the current page.

Tools used: none
