```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, CameraView, PdfView } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="panel">
		<CameraView el={cam} class="fill" />
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
			<img class="fill" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<PdfView src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
			.fill { display: block; width: 100%; }
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
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
- `base.button` has no `onClick` in its props. I used its toggle form instead: `pressed` is set to "the front camera is showing", and `onChange` calls `cam.flip()`. That assumes `pressed` follows the parent's state and does not keep a separate copy that could drift out of sync.
- The shutter is a plain `<button>` with an async `onClick`. I assumed native buttons are allowed next to `base.button`, and that an async handler can await `takePhoto()` and assign state when it finishes.
- I assumed the `ui-*` parts are written as components (`<tabs.root>`, `<base.button>`) and that `tabs.root` follows its `value` prop as it changes, with `onChange` keeping my state in step.
- I assumed a `<style>` element with a template string inside the root element works for page CSS. The guidance does not say how page stylesheets are written.
- The label reads "Page 1 of 0" until `onLoad` gives the page count. Next stays disabled until then.
- The camera panel stays in the page while its tab is hidden, so I assumed the camera keeps running there. Nothing on the sheet pauses it.
- I assumed `@if` without an `@else` is allowed, and that `{photo.url}` narrows correctly inside it.

## Website
- Camera preview: the browser's live camera picture, shown after the visitor answers the browser's camera permission prompt, stretched to the panel's width.
- PDF page: page N of `/guide.pdf` inside the browser's own PDF viewer, stretched to the panel's width.

Tools used: Read (only to open the task file)
