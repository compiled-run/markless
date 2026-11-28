```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, cameraview, pdfview } from '@markless/device';
import type { Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<cameraview el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => (photo = await cam.takePhoto())}
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
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} class="fill" alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<pdfview
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
			.fill { display: block; width: 100%; height: auto; }
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
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

- I wrote the camera and PDF elements as lowercase tags (`<cameraview>`, `<pdfview>`) and imported them from `@markless/device`. The sheet's comment shows the tags but not whether they need an import.
- `base.button` has no `onClick` prop. To get a callback for the flip button, I made it a toggle button: `pressed` follows whether the front camera is active, and `onChange` calls `cam.flip()`. I assumed `cam.facing` updates live, so the pressed state stays in sync.
- `tabs.root` only shows a tab when `value` is set, so I treat `value` as controlled: the current tab is held in state and updated from `onChange`.
- I guessed that a `<style>` element inside a `.tsrx` component is allowed (written as a template string in `{}`), and that a plain `<button onClick>` is fine for the shutter.
- I guessed that `@if` with no `@else` is allowed.
- I guessed that the label shows "Page 1 of 0" until `onLoad` fires, and that a `class` alone can make the device-drawn box full width with `width: 100%`. Its height comes from the device or browser.
- The camera panel stays in the page while its tab is hidden, so I assumed the camera keeps running there.

## Website

Camera preview: after the browser asks for camera permission, the visitor sees the browser's live camera picture in a full-width box. The box stays empty or dark while access is unknown or denied.

PDF page: the visitor sees the browser's own PDF viewer in a full-width box, showing the chosen page of `/guide.pdf`. Previous and Next change which page it shows.

Tools used: none
