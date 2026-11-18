```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';
import { base, tabs } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	const shoot = async () => {
		busy = true;
		try {
			photo = await cam.takePhoto();
		} finally {
			busy = false;
		}
	};

	<section class="media-panel">
		<camera el={cam} class="media-fill" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="media-controls">
			<button onClick={shoot} disabled={busy || cam.access === 'denied'}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				{cam.facing === 'front' ? 'Use back camera' : 'Use front camera'}
			</base.button>
		</div>
		@if (photo !== null) {
			<img class="media-fill" src={photo.url} alt="Last photo taken" />
		}
	</section>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<section class="media-panel">
		<pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="media-fill"
		/>
		<div class="media-controls">
			<button onClick={() => page--} disabled={page <= 1}>Previous</button>
			<span>
				@if (pages !== null) {
					<>Page {page} of {pages}</>
				} @else {
					<>Page {page}</>
				}
			</span>
			<button onClick={() => page++} disabled={pages === null || page >= pages}>Next</button>
		</div>
	</section>
}

export default function MediaPage() @{
	let tab = state('camera');

	<main>
		<style>{`
			.media-panel { display: flex; flex-direction: column; gap: 0.75rem; }
			.media-fill { display: block; width: 100%; }
			camera.media-fill { aspect-ratio: 3 / 4; }
			pdf.media-fill { aspect-ratio: 1 / 1.414; }
			.media-controls { display: flex; gap: 0.5rem; align-items: center; }
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

- **Flip button:** `base.button` takes no `onClick`. It only reports presses through `onChange`, and only when `pressed` is given. So I made it a toggle (`pressed={cam.facing === 'front'}`) and call `cam.flip()` from `onChange`.
- **Shutter and page buttons:** these are plain HTML `<button onClick>` elements. The task only requires `base.button` for the flip button.
- **Tabs:** `tabs.root` shows no tab unless it gets a `value`. I hold the selected tab in state starting at `'camera'` and update it from `onChange`.
- **Writing tab parts:** I guessed that member-expression tags like `<tabs.root>` work in `.tsrx`.
- **Async handler:** I guessed that a handler can be an `async` function that assigns state after an `await` (`photo = await cam.takePhoto()`).
- **Reading camera fields:** I guessed that `cam.facing` and `cam.access` can be read directly in the template and stay live.
- **Narrowing:** I guessed that `@if (photo !== null)` narrows the type of a state value.
- **Fragments:** I guessed that `<>…</>` fragments are allowed inside `@if` and `@else`.
- **Styling:** I guessed that an inline `<style>` element is an acceptable way to style the page, and that `[ui-selected]` is the attribute on the selected tab.
- **Sizing:** I guessed that `class` on `<camera>` and `<pdf>` sizes the box. The aspect ratios are my choice.
- **Hidden tab:** the Camera panel stays in the page when its tab is hidden. I guessed this is harmless, even though the camera keeps running.

## Website

Camera preview: the browser's own live camera picture, shown after the visitor allows camera access in the browser's permission prompt. It fills the panel width.

PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, with the viewer's own controls. It fills the panel width.

Tools used: none
