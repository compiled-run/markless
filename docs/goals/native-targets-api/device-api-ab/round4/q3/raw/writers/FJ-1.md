```tsx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base, native } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="camera-panel">
		<native.camera el={cam} class="fill-width" />
		<div class="controls">
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => (photo = await cam.takePhoto())}
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
		@if (photo) {
			<img class="fill-width" src={photo.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="document-panel">
		<native.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill-width"
		/>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages ?? '…'}</span>
			<button disabled={pages === null || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill-width { display: block; width: 100%; }
			.native-camera-box { aspect-ratio: 3 / 4; }
			.controls { display: flex; gap: 0.5rem; align-items: center; margin-block: 0.5rem; }
			[ui-selected] { font-weight: bold; }
			[ui-pressed] { outline: 2px solid currentColor; }
		`}</style>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<>
				<tabs.list>
					<>
						<tabs.trigger value="camera">Camera</tabs.trigger>
						<tabs.trigger value="document">Document</tabs.trigger>
					</>
				</tabs.list>
				<tabs.content value="camera">
					<CameraPanel />
				</tabs.content>
				<tabs.content value="document">
					<DocumentPanel />
				</tabs.content>
			</>
		</tabs.root>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` takes no `onClick`, and its `onChange` only fires when `pressed` is given. So I made the flip button a toggle with `pressed={cam.facing === 'front'}` and had it call `cam.flip()` in `onChange`. The shutter and the Previous/Next buttons are plain `<button onClick>`.
- The sheet only says fields are live; I assumed that reading `cam.facing`, `cam.access` and `photo` in the markup updates the page when they change.
- I assumed an async handler that assigns state after `await` (`photo = await cam.takePhoto()`) works.
- I assumed `@if (photo)` narrows the type of `photo` so that `photo.url` type-checks.
- I assumed `tabs.root` is controlled through `value` plus `onChange`, and that it uses `tabs.content` with the same `value` to show the right panel.
- The guidance never says how a page holds CSS, so I put a plain `<style>` element in the page. I also guessed that the native box needs `display: block`. The `.native-camera-box` rule is a leftover that no element uses.
- I assumed the camera can be created inside a tab panel's component, and that it keeps running while that panel is hidden.
- I assumed `pages` stays `null` until `onLoad` fires, so the label shows "…" until then.
- I assumed the file needs no route registration and exports one default component.

## Website
Camera preview: after the browser's camera permission prompt, the visitor sees the browser's live camera picture in a box as wide as the panel (if they deny access, the box stays empty and a "Camera access was denied" message shows).
PDF page: the visitor sees the browser's own PDF viewer showing the current page of `/guide.pdf`, as wide as the panel, with its own built-in viewer controls.

Tools used: none
