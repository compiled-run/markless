```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';
import './media.css';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="media-panel">
		<base.camera el={cam} class="media-fill" />
		<div class="media-controls">
			<button
				disabled={busy}
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
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="media-fill" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="media-panel">
		<base.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="media-fill"
		/>
		<div class="media-controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button disabled={pages === 0 || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

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
}
```

```css
// file: pages/media.css
.media-panel { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; }
.media-fill { display: block; width: 100%; }
base-camera.media-fill, .media-panel > .media-fill:first-child { aspect-ratio: 3 / 4; }
.media-controls { display: flex; gap: 0.5rem; align-items: center; }
[ui-selected] { font-weight: bold; }
[role="tabpanel"]:not([ui-selected]) { display: none; }
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so I made the flip button a toggle button. `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I'm assuming its `onChange` fires on every press and that `pressed` keeps following the live `cam.facing`.
- I used a plain native `<button onClick>` for the shutter and for Previous/Next, and assumed an async click handler that assigns state works.
- I'm assuming `camera()` should be called in the body of the component that shows it, and that the camera keeps running while its tab panel is hidden.
- I'm assuming a `@if (photo)` check narrows `Photo | null`, so `photo.url` can be read inside it.
- The page says nothing about how to add CSS. I guessed that importing a `.css` file next to the page works. I also guessed what the content and camera elements look like in the DOM: that the hidden content part carries no `ui-selected`, and that the camera element's box takes `class`. The `base-camera` selector is a pure guess, so I also included a fallback selector.
- I guessed that a hidden tab panel should be hidden with my own CSS, because the sheet says "stays in the page".
- Before `onLoad` fires, the label reads "Page 1 of 0".

## Website
- Camera preview: the browser's own camera picture, after the browser asks for camera permission, filling the panel's width.
- PDF page: the browser's built-in PDF viewer showing `/guide.pdf` at the current page, filling the panel's width; its contents can't be styled.

Tools used: none
