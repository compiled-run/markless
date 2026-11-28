```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<section class="panel">
		<video class="fill" src={cam} />
		<div class="controls">
			<button onClick={async () => (last = await cam.takePhoto())}>Take photo</button>
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img class="fill" src={last.url} alt="Last photo" />
		}
	</section>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<section class="panel">
		<embed class="fill" src={doc} />
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => doc.page--}>Previous</button>
			<span>Page {doc.page} of {doc.pages}</span>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => doc.page++}>Next</button>
		</div>
	</section>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; }
			embed.fill { aspect-ratio: 3 / 4; }
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
- Parts of a family are used as JSX tags with dotted names (`<tabs.root>`, `<base.button>`).
- `base.button` has no `onClick`, so I made the flip button a toggle: `pressed` follows `cam.facing === 'front'` and `onChange` calls `cam.flip()`. I assumed the live `facing` field then sets the pressed state.
- The shutter is a plain `<button>`, because the task only asks for the flip button to be built with `base.button`. I assumed an async handler that assigns to state is allowed.
- `Photo` is exported as a type from `@markless/device`, and `@if (last)` narrows away the `null`.
- Assigning to device object fields (`doc.page--`) and reading them in markup (`cam.facing`, `doc.pages`) is reactive, because the sheet calls the fields "live".
- A `<style>` element inside the root, with a template literal as its child, is valid in `.tsrx`. The `aspect-ratio` on the PDF box is a guess, since an `<embed>` has no height of its own.
- Inactive tab panels stay in the page, so the camera keeps running while the Document tab shows. I did not try to pause it.
- `src={cam}` and `src={doc}` type-check without casts.

## Website
- Camera preview: after the browser asks for camera permission, the visitor sees the browser's live camera picture in a `<video>` box as wide as the panel.
- PDF page: the visitor sees `/guide.pdf` in the browser's own PDF viewer, as wide as the panel and opened at the current page.

Tools used: none
