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

	const shoot = async () => {
		busy = true;
		try {
			photo = await cam.takePhoto();
		} finally {
			busy = false;
		}
	};

	<section class="camera-panel">
		<CameraView el={cam} class="fill-width" />
		<div class="controls">
			<button onClick={shoot} disabled={busy || cam.access === 'denied'}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill-width" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		} @else {
			<p>No photo yet.</p>
		}
	</section>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<section class="document-panel">
		<PdfView src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill-width" />
		<div class="controls">
			<button onClick={() => page--} disabled={page <= 1}>Previous</button>
			<span>Page {page} of {pages ?? '…'}</span>
			<button onClick={() => page++} disabled={pages === null || page >= pages}>Next</button>
		</div>
	</section>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill-width { display: block; width: 100%; }
			.camera-panel .fill-width { aspect-ratio: 3 / 4; height: auto; }
			.document-panel .fill-width { aspect-ratio: 1 / 1.414; }
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
- `base.button` has no `onClick`, so I made the flip button a toggle: `pressed` is true when the front camera is in use, and `onChange` calls `cam.flip()`. I also guessed that the toggle's state stays in step with the `pressed` prop each time `cam.facing` changes.
- The shutter is a plain `<button onClick>`, because only the flip button had to use `base.button`. I guessed that an async handler outside `@try` is fine, since it does not read an async computed.
- I guessed that member-expression tags such as `<tabs.root>` and `<base.button>` work in `.tsrx`.
- I guessed that a `<style>` element with a template-string child is an acceptable way to add page CSS, and that the camera and PDF boxes need a set height or aspect ratio to be visible.
- I guessed that `tabs.content` panels stay mounted, so the camera keeps running while the Document tab shows, because the sheet says a panel "stays in the page".
- I guessed that `PdfView` reacts when the `page` prop changes, and that `onLoad` fires before the page count is needed. Until it fires, the label shows "…".
- I guessed that `try/finally` and `await` are allowed inside a handler, and that writing to state there is ordinary assignment.

## Website
Camera preview: after the visitor answers the browser's camera permission prompt, they see the browser's live camera picture filling the panel's width. Until then, and if they deny access, the box is empty.
PDF page: the visitor sees the browser's own PDF viewer showing the chosen page of `/guide.pdf` across the panel's width. That viewer has its own built-in controls, which the app cannot style.

Tools used: none
