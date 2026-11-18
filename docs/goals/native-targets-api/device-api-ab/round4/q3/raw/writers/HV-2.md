```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);

	<div class="panel">
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<video src={cam} class="fill" />
		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (last = await cam.takePhoto())}>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img src={last.url} alt="Last photo" class="fill" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<embed src={doc} class="fill" />
		<p>Page {doc.page} of {doc.pages}</p>
		<div class="controls">
			<button disabled={doc.page <= 1} onClick={() => doc.page--}>Previous</button>
			<button disabled={doc.page >= doc.pages} onClick={() => doc.page++}>Next</button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.fill { display: block; width: 100%; }
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed={cam.facing === 'front'}` and `onChange` calls `cam.flip()`. Its pressed state means "front camera".
- I assumed `tabs.root` works as a controlled component (a `value` from state plus `onChange`) and that the `<tabs.root>` member-expression tag syntax is allowed.
- I assumed that assigning to `doc.page` (`doc.page++`) updates the view, because the sheet says "assign to change it".
- I assumed that `@if (last)` narrows `last` so `last.url` type-checks, and that an `@if` with no `@else` is allowed.
- I assumed an async arrow handler that assigns a state variable is fine outside `@try`, because `takePhoto` is a plain promise and not an async computed.
- For the styles, I guessed that a `<style>` element inside the root with a template-string child works. I also guessed that `.fill { width: 100% }` on `<video>`/`<embed>` sizes the native view on iPhone and Android.
- I assumed it is fine that the camera keeps running while the Document tab shows, because a panel stays in the page when its tab is not showing.
- I assumed that importing `type Photo` from `@markless/device` works.

## Website
- Camera preview: after the visitor allows camera access in the browser's prompt, they see the browser's live camera picture in a `<video>` element as wide as the panel.
- PDF page: the browser's own PDF viewer, embedded as wide as the panel, showing the current page of `/guide.pdf`, probably with the browser's own toolbar.

Tools used: none
