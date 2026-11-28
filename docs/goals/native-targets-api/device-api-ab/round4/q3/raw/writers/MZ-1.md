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

	const shoot = async () => {
		busy = true;
		try {
			last = await cam.takePhoto();
		} finally {
			busy = false;
		}
	};

	<div class="panel">
		<camera el={cam} class="fill" />
		<div class="controls">
			<button onClick={shoot} disabled={busy || cam.access === 'denied'}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		@if (last) {
			<img class="fill" src={last.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
			<button onClick={() => (page = page - 1)} disabled={page <= 1}>Previous</button>
			<span>Page {page} of {pages}</span>
			<button onClick={() => (page = page + 1)} disabled={pages === 0 || page >= pages}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
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
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; }
			.fill { display: block; width: 100%; }
			camera.fill, pdf.fill { aspect-ratio: 3 / 4; }
			.controls { display: flex; gap: 0.5rem; align-items: center; }
		`}</style>
	</main>
}
```

Confidence: 3/5

## Guesses
- The `base.button` sheet lists no `onClick`. I used its toggle form for Flip: `pressed` follows `cam.facing === 'front'` and `onChange` calls `cam.flip()`. The `pressed` value may briefly disagree with the camera between the press and the facing update.
- The shutter is a plain `<button onClick>` because the task only requires `base.button` for Flip.
- I assumed `<tabs.root>` and the other member-expression JSX tags work, and that a controlled `value` plus `onChange` is the right way to make Camera show first.
- I assumed `@if (last)` narrows `last` to `Photo` inside the block.
- I assumed `async` handlers and `try/finally` work inside a handler, and that assigning state there (`busy`, `last`) updates the page.
- I assumed a hidden tab panel keeps its camera running, because the sheet says content stays in the page. I also assumed `ready` waits for the element to be on screen, so taking a photo should happen while the Camera tab is showing.
- I guessed that a `<style>` element inside the page is how a page carries its CSS. I also guessed that the `camera` and `pdf` tags can be targeted by tag-name selectors and need a set height (here `aspect-ratio`).
- The page count shows "of 0" until `onLoad` fires.
- The disabled state for denied access is my own choice; the task did not ask for it.

## Website
- Camera preview: after the browser asks for camera permission, the visitor sees the browser's live camera picture at the panel's full width (front or back camera, depending on the device).
- PDF page: the visitor sees the browser's built-in PDF viewer showing the chosen page of `/guide.pdf` at the panel's full width, with the browser's own viewer styling.

Tools used: none
