```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, native } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="panel">
		<native.camera el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={busy || !cam.ready}
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
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<native.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill"
		/>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>Next</button>
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed` is set when the front camera is on, and its `onChange` calls `cam.flip()`. I assumed the toggle's `pressed` follows `cam.facing`, which is live state.
- I used a plain HTML `<button onClick>` for the shutter, because a plain `base.button` has no press handler.
- I assumed parts can be written as member tags in `.tsrx` (`<tabs.root>`, `<native.camera>`).
- I assumed an `@if` with no `@else` is allowed and that `@if` can narrow `photo` from `null`.
- I assumed I can read `cam.facing`, `cam.ready` and `cam.access` directly in markup and in props, and that the markup updates when they change.
- I assumed a `<style>` element with a template string inside the root works for page styles. I did not know where Markless page CSS should go.
- I assumed it is fine to set `page` on `native.pdf` before `onLoad` has run, and that the label reads "Page 1 of 0" until the PDF loads.
- I assumed the camera panel stays in the page while its tab is hidden ("stays in the page"), so the camera keeps running. Nothing on the sheet says whether it pauses.

## Website
- Camera preview: after the visitor answers the browser's camera permission prompt, they see the browser's live camera picture, stretched to the width of the panel. They cannot style it.
- PDF page: the browser's own PDF viewer shows `/guide.pdf` at the chosen page, filling the width of the panel.

Tools used: none
