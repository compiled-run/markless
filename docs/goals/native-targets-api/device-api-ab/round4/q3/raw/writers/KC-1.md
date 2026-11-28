```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, CameraView, PdfView } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="camera-panel">
		<CameraView el={cam} class="fill-width" />
		<div class="camera-controls">
			<button
				disabled={cam.access === 'denied'}
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
			<img class="fill-width" src={last.url} width={last.width} height={last.height} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="document-panel">
		<PdfView
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill-width"
		/>
		<p>
			Page {page} of {pages}
		</p>
		<div class="document-controls">
			<button disabled={page <= 1} onClick={() => page--}>
				Previous
			</button>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>
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
			.camera-panel .fill-width { aspect-ratio: 3 / 4; }
			.document-panel .fill-width { aspect-ratio: 1 / 1.414; }
			[ui-selected] { font-weight: bold; }
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
- I assumed the parts are written as member-expression tags like `<tabs.root>` and `<base.button>`, and that children go between the tags.
- I assumed `tabs.root` is controlled: it shows the tab named in `value`, and its `onChange` writes the new value back to state. That is why I seeded the state with `'camera'`.
- `base.button` lists no `onClick`. So I built the flip button as a toggle: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I used a native `<button>` for the shutter because it needs a click handler.
- I assumed the `.fill-width` class sizes the device box directly. The aspect ratios are my own choice, made so each box has a height.
- I assumed a `<style>` block inside the component with a template-literal child is valid. The CSS might belong in a separate stylesheet instead.
- I assumed `cam.facing`, `cam.access` and the PDF `page` prop react to changes when read in markup.
- Before `onLoad` fires, the label reads "Page 1 of 0".
- The Camera panel stays on the page while the Document tab is showing, so the camera keeps running there. I did not try to stop it.

## Website
- Camera preview: the browser's live camera picture, shown after the visitor allows camera access, filling the panel width.
- PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, filling the panel width.

Tools used: Read (once, to open the task file as instructed; none for the answer itself)
