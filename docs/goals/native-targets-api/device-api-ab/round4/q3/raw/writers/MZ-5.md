```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div class="panel">
		<camera el={cam} class="fill" />
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
		<pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
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
- I assumed `tabs.root` does not switch tabs on its own. It holds `value`, so I control it with state and update that state in `onChange`.
- The sheet gives `base.button` no `onClick` prop. So the flip button is a toggle button: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`.
- The shutter is a plain `<button>` with `onClick`, because the task only asks for `base.button` on the flip button. It is disabled until `cam.ready`.
- I assumed `<base.button>` and `<tabs.root>` (dotted names) work as JSX tags.
- I assumed a `<style>` element with a template-string child is an acceptable way to add the stylesheet inside the page. The sheet only says to style "from a stylesheet".
- I assumed the camera can stay running while its panel is hidden, because the sheet says a panel stays in the page when its tab is not showing.
- The label reads "Page 1 of 0" until `onLoad` fires.
- I assumed an `async` arrow function is fine as an `onClick` handler, and that `photo.url` narrows correctly inside `@if (photo)`.

## Website
- Camera preview: a box showing the browser's own live camera picture, after the visitor answers the browser's camera permission prompt.
- PDF page: the browser's built-in PDF viewer showing the current page of `/guide.pdf`, stretched to the panel's width.

Tools used: none (apart from reading the task file)
