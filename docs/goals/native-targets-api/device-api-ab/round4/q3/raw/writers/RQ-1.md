```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let busy = state(false);

	<div class="panel">
		<base.camera el={cam} class="fill" />
		<div class="controls">
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
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state<number | null>(null);

	<div class="panel">
		<base.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="fill" />
		<div class="controls">
			<button disabled={page <= 1} onClick={() => (page = page - 1)}>Previous</button>
			<span>Page {page} of {pages ?? '…'}</span>
			<button disabled={pages === null || page >= pages} onClick={() => (page = page + 1)}>Next</button>
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
- **Flip button:** the sheet gives `base.button` no `onClick`, and it does not say whether a plain button (no `pressed`) calls `onChange`. So I made it a toggle: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`.
- **Tabs:** I guessed that `tabs.root` needs a controlled `value` plus `onChange` to switch tabs, because the sheet says omitting `value` shows no tab. I also guessed that the `ui-selected` attribute marks the active trigger.
- **Plain buttons:** I used a plain `<button onClick>` for the shutter and for Previous/Next, and an async handler outside `@try` for the shutter.
- **Styles:** I put the CSS in an inline `<style>` inside the root element. The guidance doesn't say how styles are added.
- **`@if`:** the guidance lists `@if` as a block but shows no example, so the syntax `@if (photo) { … }` is a guess.
- **Type import:** I guessed that `import { type Photo }` is allowed in `.tsrx`.
- **Hidden tab:** the Camera content stays in the page while the Document tab shows. I assumed the camera only stops being `ready` then, and nothing breaks.
- **Page count:** before `onLoad` runs, the page count shows as "…".

## Website
- **Camera preview:** the browser's own live camera picture, at the full panel width, once the visitor allows camera access in the browser's permission prompt.
- **PDF page:** the browser's built-in PDF viewer showing the current page of `/guide.pdf`, at the full panel width.

Tools used: none
