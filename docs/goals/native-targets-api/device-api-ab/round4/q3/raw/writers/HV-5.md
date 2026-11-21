```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<video class="fill" src={cam} />
		<div class="controls">
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => (photo = await cam.takePhoto())}
			>
				Take photo
			</button>
			<base.button
				pressed={cam.facing === 'front'}
				disabled={cam.access === 'denied'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<embed class="fill" src={doc} />
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>
				Previous
			</button>
			<span>
				{doc.pages === 0 ? 'Loading…' : `Page ${doc.page} of ${doc.pages}`}
			</span>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => (doc.page = doc.page + 1)}>
				Next
			</button>
		</div>
	</div>
}

export default function MediaPage() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; height: auto; }
			embed.fill { aspect-ratio: 3 / 4; }
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
- `tabs.root`'s `value` is controlled, so I hold it in state and update it from `onChange`. `value="camera"` makes Camera show first.
- `base.button` has no `onClick`. To make the flip button work, I made it a toggle (`pressed={cam.facing === 'front'}`) and called `cam.flip()` from `onChange`. I am assuming `onChange` runs on every press and that the bound `pressed` follows `cam.facing`.
- The shutter is a plain `<button>` with an async `onClick` that assigns the result of `takePhoto()` to state. I am assuming an async handler outside `@try` is allowed, and that `takePhoto()` waits even if the panel is hidden.
- Both tab panels stay in the page, so the camera may start (and ask for permission) before the Camera tab is shown. Since Camera shows first, this should not matter.
- `<video src={cam}>` and `<embed src={doc}>` take the device objects directly, as the sheet says. `doc.page` can be assigned straight from a handler.
- I am not sure a `<style>` block with a template string is the correct way to add CSS in Markless. Any stylesheet with `.fill { width: 100% }` would work. The `embed` height (`aspect-ratio`) is my guess, because the sheet gives no natural size for a PDF page.
- The `<img>` `width`/`height` attributes are only hints. The CSS makes the image fill the width.

## Website
- Camera preview: the browser's own live camera picture in a `<video>` element, after the visitor allows camera access in the browser's permission prompt. It spans the panel's width.
- PDF page: the browser's built-in PDF viewer in an `<embed>` element, showing `/guide.pdf` at the current page (with the viewer's own toolbar). It spans the panel's width.

Tools used: none (besides the one Read of the task file, which the instructions asked for)
