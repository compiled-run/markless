```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base, system } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		@if (cam.access === 'denied') {
			<p>Camera access was denied.</p>
		}
		<system.camera el={cam} class="fill" />
		<div class="controls">
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
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
	let pages = state<number | null>(null);

	<div class="panel">
		<system.pdf
			src="/guide.pdf"
			page={page}
			onLoad={(info) => (pages = info.pages)}
			class="fill"
		/>
		<div class="controls">
			<button disabled={page <= 1} onClick={() => page--}>Previous</button>
			<span>Page {page} of {pages ?? '…'}</span>
			<button disabled={pages === null || page >= pages} onClick={() => page++}>Next</button>
		</div>
	</div>
}

export default function MediaPage() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.5rem; }
			.fill { display: block; width: 100%; }
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
- `tabs.root` seems to be controlled: its `value` sets which tab shows, so I keep it in state and update it from `onChange`. I don't know whether it would switch tabs by itself if I left `onChange` off.
- `base.button` has no `onClick` prop. So the flip button is a toggle: `pressed` is set to "front camera is active" and `onChange` calls `cam.flip()`. The shutter, Previous and Next buttons are native `<button onClick>`, because the sheet doesn't say whether a plain `base.button` ever calls `onChange`.
- I assumed an async arrow function works as an event handler and that assigning to state after `await` updates the page.
- I assumed `@if (photo)` narrows the type so `photo.url` type-checks.
- I assumed a `<style>` element with a template-string child works as the page stylesheet, and that `class` reaches the `system.*` boxes so `width: 100%` makes them fill the panel. I also assumed a `ui-selected` attribute is set on the active tab.
- The camera tab's content stays in the page while hidden, so I assumed the camera keeps running there and is released only when the page leaves.
- I assumed native props such as `disabled` work on native `<button>`, and that text and `{}` mix inside an element (`Page {page} of {pages ?? '…'}`).

## Website
- Camera preview: after the browser asks for camera permission and the visitor allows it, the browser's live camera picture appears, sized to the panel's width.
- PDF page: the browser's own PDF viewer shows the current page of `/guide.pdf` at the panel's width. Its look and controls come from the browser and can't be styled.

Tools used: none
