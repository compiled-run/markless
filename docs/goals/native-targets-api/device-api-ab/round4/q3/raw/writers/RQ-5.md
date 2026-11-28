```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let lastPhoto = state<Photo | null>(null);
	let shooting = state(false);

	<div class="panel">
		<base.camera el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={!cam.ready || shooting}
				onClick={async () => {
					shooting = true;
					try {
						lastPhoto = await cam.takePhoto();
					} finally {
						shooting = false;
					}
				}}
			>
				Shutter
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (lastPhoto) {
			<img class="fill" src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="panel">
		<base.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
			.panel { display: flex; flex-direction: column; gap: 0.75rem; }
			.fill { display: block; width: 100%; }
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
- The sheet gives `base.button` no `onClick`, only `pressed` and `onChange`. So I made the flip button a toggle: it is "pressed" while the front camera is on, and every change calls `cam.flip()`. I used a plain `<button onClick>` for the shutter.
- `tabs.root` shows no tab if `value` is left out, so I keep the selected tab in state and start it at `'camera'`.
- I assumed member tags like `<tabs.root>` and `<base.camera>` work in `.tsrx`.
- I assumed `@if` without `@else` is allowed.
- I assumed a `<style>` element with a template-string child is an acceptable way to add the width classes. The guidance says nothing about where stylesheets go.
- I assumed I can assign state after an `await` inside an async handler.
- I assumed the camera's `ready`, `facing` and `access` fields update the page by themselves, since the sheet calls them "live".
- The camera panel stays in the page when its tab is hidden, so I assumed the camera keeps running while the Document tab shows. The camera is only released when the component leaves the page.
- The label shows "…" for the page count until `onLoad` reports it.
- I made the shutter button disabled until the camera is ready. This isn't strictly needed, because `takePhoto` waits for ready anyway.

## Website
- Camera preview: the browser's own camera picture, the full width of the panel, after the visitor allows camera access in the browser's permission prompt.
- PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, the full width of the panel.

Tools used: Read (only to open the task file)
