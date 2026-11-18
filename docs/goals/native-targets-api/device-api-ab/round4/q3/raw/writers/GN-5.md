```tsx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, View } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="camera-panel">
		<View el={cam} class="fill-width" />
		<div class="controls">
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => {
					last = await cam.takePhoto();
				}}
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
		@if (last) {
			<img class="fill-width" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="document-panel">
		<View el={doc} class="fill-width" />
		<p>
			{doc.pages === 0 ? 'Loading…' : `Page ${doc.page} of ${doc.pages}`}
		</p>
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => (doc.page = doc.page - 1)}>
				Previous
			</button>
			<button disabled={doc.pages === 0 || doc.page >= doc.pages} onClick={() => (doc.page = doc.page + 1)}>
				Next
			</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>
			{`
				.fill-width { display: block; width: 100%; }
				.document-panel .fill-width { aspect-ratio: 1 / 1.414; }
			`}
		</style>
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
- The flip button: `base.button` has no click handler prop, and its `onChange` only fires when `pressed` is given. So I made it a toggle with `pressed={cam.facing === 'front'}` and call `cam.flip()` from `onChange`. I assumed it does not matter that "pressed" means "front camera".
- The shutter is a native `<button onClick>`, because a plain `base.button` has no click handler prop. I also assumed an async handler that assigns state after `await` works.
- I assumed `base.button` accepts `disabled` alongside the other props (the sheet lists it) and that the `ui-pressed` attribute is only for styling.
- `<tabs.root>` and the other dotted part names are written as JSX tags directly. `tabs.root` is a controlled value with `onChange`, starting at `'camera'`.
- Assigning `doc.page = …` from a handler moves the PDF view to that page, and reading `doc.page` / `doc.pages` updates the label live.
- The `<style>` block inside the component, written with a template-string child, is a guess at how page CSS is written. The class goes on `<View>`, and I guessed the box needs an explicit height/aspect ratio for the PDF.
- `@if (last)` narrows `Photo | null` so `last.url` type-checks inside it.
- The camera keeps running while the Document tab is showing, because the panel stays in the page.

## Website
- Camera preview: the browser's own live camera picture, shown after the visitor answers the browser's camera permission prompt, filling the panel width.
- PDF page: the browser's built-in PDF viewer, with its own toolbar and controls, showing `/guide.pdf` in a full-width box. My Previous/Next buttons and the "Page X of Y" label sit below it.

Tools used: none
