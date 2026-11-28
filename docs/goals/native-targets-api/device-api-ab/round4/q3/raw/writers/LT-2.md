```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, system } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<system.camera el={cam} class="fill" />
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill" src={photo.url} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="panel">
		<system.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
			.fill { display: block; width: 100%; }
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

`base.button` has no `onClick` prop. So I made the flip button a toggle: `pressed` follows whether the front camera is on, and `onChange` calls `cam.flip()`. That means screen readers announce it as a pressed or not-pressed toggle.

I guessed that writing JSX like `<tabs.root>` and `<system.camera>` works for the namespaced parts, and that children are passed in the usual way.

I guessed that a `<style>` element with a template-string child is an acceptable way to add page CSS. The guidance does not say where styles go.

I guessed that reading `cam.facing`, `cam.ready` and `cam.access` in markup updates live, because the sheet says the fields are live.

I guessed that `@if (photo)` narrows `photo` to `Photo` inside the block, and that `@if` without an `@else` is allowed.

The shutter handler does not catch errors from `takePhoto()`.

The camera keeps running while the Document tab is showing, because hidden panels stay in the page. I assumed that is acceptable.

I assumed `onChange` on `tabs.root` is enough to keep `tab` in sync when tabs are clicked.

## Website

Camera preview: the browser's live camera picture, after the browser asks for camera permission, stretched to the full width of the panel.

PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, at the full width of the panel.

Tools used: none
