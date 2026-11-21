```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base, native, tabs } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<native.camera el={cam} class="fill" />
		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="fill" src={photo.url} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div class="panel">
		<native.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
- `base.button` has no `onClick` prop. To flip the camera I made it a toggle button: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I am assuming the pressed state comes back from the live `facing` field rather than drifting out of step with it.
- I assumed a `.tsrx` component can be rendered as `<tabs.root>` / `<native.camera>`, with JSX children going into `children`.
- I assumed a `<style>` element with a template-string child is how page CSS is written. The guidance does not say how to add styles.
- I assumed an async arrow function works as an `onClick` handler, and that assigning the awaited photo to state updates the view.
- I assumed `photo.url` is narrowed to non-null inside `@if (photo)`.
- I assumed the camera starts when its panel is showing, even though both tab panels stay in the page. While the Document tab shows, `cam.ready` may be false.
- `pages` starts at 0, so the label reads "Page 1 of 0" until `onLoad` fires.
- I assumed the selected tab carries a `ui-selected` attribute for styling.

## Website
- Camera preview: after the visitor answers the browser's camera permission prompt, they see the browser's live camera picture stretched to the panel width. They can't style it.
- PDF page: the visitor sees page N of `/guide.pdf` in the browser's own PDF viewer, which may have its own toolbar, filling the panel width.

Tools used: none
