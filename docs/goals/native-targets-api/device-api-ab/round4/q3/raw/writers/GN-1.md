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
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
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
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>Previous</button>
			<span>Page {doc.page} of {doc.pages}</span>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => (doc.page = doc.page + 1)}>Next</button>
		</div>
	</div>
}

export default function MediaPage() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; height: auto; }
			.fill:not(img) { aspect-ratio: 3 / 4; }
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
- `base.button` has no `onClick` prop. To flip the camera I gave it `pressed={cam.facing === 'front'}` and call `cam.flip()` from `onChange`. That makes it a toggle button (pressed when the front camera is on) and adds `aria-pressed`.
- The shutter is a plain `<button>`, because the task only asks for the flip button to use `base.button`.
- I assumed a state variable can be assigned after an `await` inside an async handler (`last = await cam.takePhoto()`).
- I assumed assigning `doc.page = …` re-renders the label. The sheet says the fields are "live", so it should.
- I assumed the device objects' fields (`cam.ready`, `cam.facing`, `doc.page`, `doc.pages`) can be read directly in markup and attribute expressions without `@try`, since they are not async computeds.
- How styles go into a `.tsrx` file is a guess: I used a `<style>` element inside the root. The `aspect-ratio` gives the `View` boxes a height. Their real default height is unknown.
- Writing `<tabs.root …>` (part access with a dot) as the JSX syntax for the family parts is also a guess.
- The camera panel stays in the page when its tab is hidden, so the camera may keep running while the Document tab is shown. I did not try to stop it.
- I assumed `@if (last)` narrows `last` to a non-null `Photo` inside the block.

## Website
- Camera preview: the browser's live camera picture, filling the panel width, after the visitor allows camera access in the browser's permission prompt. Until then, or if access is denied, the box stays empty.
- PDF page: the browser's built-in PDF viewer showing `/guide.pdf` at the current page, filling the panel width, with the viewer's own toolbar and styling.

Tools used: none
