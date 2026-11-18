```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, View } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="panel">
		<View el={cam} class="fill" />
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
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (last) {
			<img class="fill" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<View el={doc} class="fill" />
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>
				Previous
			</button>
			<span>
				Page {doc.page} of {doc.pages}
			</span>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => (doc.page = doc.page + 1)}>
				Next
			</button>
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
			[ui-selected] { font-weight: bold; }
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

- The sheet gives `base.button` no `onClick`, so the flip button is a toggle: `pressed={cam.facing === 'front'}` and `onChange={() => cam.flip()}`. I assumed `pressed` follows the live `cam.facing` field.
- I assumed an `async` arrow works as a native `onClick` handler, and that assigning to `last` after the `await` updates the photo shown.
- I assumed assigning `doc.page = doc.page - 1` (or `+ 1`) on the live `Pdf` object is enough to change the page shown, and that `doc.page`, `doc.pages`, `cam.ready` and `cam.facing` re-render text and attributes as plain live reads, with no `@try`.
- I assumed `@if (last)` narrows `last` to `Photo` inside the block, and that `@if` without `@else` is allowed.
- I don't know how styles are attached to a page. I guessed a `<style>` element with a template string. A separate stylesheet could replace it.
- Hidden tab panels stay in the page, so the camera may keep running while the Document tab shows. I assumed that is acceptable.
- I assumed the tab values `'camera'` and `'document'`, and that `value` plus `onChange` with a `state` is the right way to drive `tabs.root`.

## Website

- Camera preview: after the visitor allows camera access in the browser's prompt, they see the browser's live camera picture, stretched to the panel's width. It cannot be styled inside.
- PDF page: the visitor sees `/guide.pdf` in the browser's own PDF viewer, likely with that viewer's toolbar, sized to the panel's width. Previous and Next set `doc.page`.

Tools used: none
