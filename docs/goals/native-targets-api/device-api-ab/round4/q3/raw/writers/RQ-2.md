```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);
	let busy = state(false);

	<div class="panel">
		<base.camera el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={busy || cam.access === 'denied'}
				onClick={async () => {
					busy = true;
					try {
						last = await cam.takePhoto();
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
		@if (last !== null) {
			<img class="fill" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<base.pdf
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
		`}</style>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="camera">Camera</tabs.trigger>
				<tabs.trigger value="document">Document</tabs.trigger>
			</tabs.list>
			<tabs.content value="camera">
				@if (tab === 'camera') {
					<CameraPanel />
				}
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

- `base.button` has no click prop, so the only way to get a click from it is `onChange`. That means giving it `pressed`, which makes it a toggle. I made "pressed" mean the front camera is in use, and every press calls `flip()`.
- I made the shutter a plain `<button onClick>`, because `base.button` without `pressed` has no way to report a press.
- Hidden tab panels stay in the page, so I wrapped the camera panel in `@if (tab === 'camera')`. That stops and releases the camera when the visitor leaves the tab. The cost is that the last photo is lost when they switch tabs.
- I assumed the tabs family hides a non-selected panel itself, without me writing CSS against a `ui-*` attribute.
- I wasn't sure how to write a `<style>` block in `.tsrx`, so I guessed at the syntax and where to put it.
- I assumed `@if (last !== null)` narrows `last` to `Photo` inside the block.
- I assumed `class` on `base.camera` and `base.pdf` sizes the box, as the sheet says, and that `width: 100%` makes it fill the panel.
- The page label reads "Page 1 of 0" until `onLoad` fires.

## Website

- Camera preview: after the browser's permission prompt, the visitor sees the browser's live camera picture filling the panel width.
- PDF page: the visitor sees page N of `/guide.pdf` in the browser's own PDF viewer, filling the panel width.

Tools used: none
