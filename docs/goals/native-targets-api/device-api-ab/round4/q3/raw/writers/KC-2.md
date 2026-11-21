```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, CameraView, PdfView } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="panel">
		<CameraView el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					last = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img class="fill" src={last.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="panel">
		<PdfView
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill"
		/>
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
- `base.button` has no `onClick`. I made the flip button a toggle button: `pressed` follows `cam.facing === 'front'` and `onChange` calls `cam.flip()`. The sheet does not say whether a plain `base.button` (one without `pressed`) calls `onChange` when pressed.
- Reading `cam.ready` and `cam.facing` in markup updates the page, because the sheet says the camera's fields are "live".
- The shutter is a native `<button>` with an async `onClick` that assigns the photo to state. I disabled it until the camera is ready, although `takePhoto()` already waits until the camera is ready.
- `@if (last)` narrows `last` to a `Photo`. An `@if` with no `@else` is allowed.
- Member-expression tags such as `<tabs.root>` and `<base.button>` work in `.tsrx`.
- Writing a `<style>` element with a template-literal child is accepted, and its rules reach the `class` given to `CameraView` and `PdfView`.
- Text and `{}` expressions can be mixed inside one `<span>`.
- The camera is created inside the Camera panel component. Because tab content stays in the page while its tab is hidden, the camera keeps running when the Document tab shows.

## Website
Camera preview: the browser's live camera picture, shown at the full width of the panel after the visitor allows camera access in the browser's permission prompt.
PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf` at the full width of the panel.

Tools used: none
