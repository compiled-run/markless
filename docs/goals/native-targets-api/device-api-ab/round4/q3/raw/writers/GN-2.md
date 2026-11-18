```tsrx
// file: pages/media.tsrx
import { state } from '@markless/core';
import { camera, pdf, View, type Photo } from '@markless/device';
import { tabs, base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<div class="panel">
		<View el={cam} class="fill" />
		<div class="controls">
			<base.button onChange={async () => (photo = await cam.takePhoto())}>Take photo</base.button>
			<base.button onChange={() => cam.flip()}>
				{cam.facing === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
			</base.button>
		</div>
		@if (photo) {
			<img class="fill" src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div class="panel">
		<View el={doc} class="fill" />
		<div class="controls">
			<base.button disabled={doc.page <= 1} onChange={() => (doc.page = doc.page - 1)}>Previous</base.button>
			<span>{doc.pages === 0 ? 'Loading…' : `Page ${doc.page} of ${doc.pages}`}</span>
			<base.button disabled={doc.pages === 0 || doc.page >= doc.pages} onChange={() => (doc.page = doc.page + 1)}>
				Next
			</base.button>
		</div>
	</div>
}

export default function Media() @{
	let tab = state('camera');

	<main>
		<style>{`
			.panel { display: flex; flex-direction: column; gap: 0.75rem; }
			.fill { display: block; width: 100%; }
			.controls { display: flex; align-items: center; gap: 0.5rem; }
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

`base.button`'s click handler: the sheet only gives `onChange` and says nothing like `onClick`. I guessed that on a plain button (no `pressed`), `onChange` fires on each press. If it doesn't, the shutter and flip buttons need a different click prop.

Async handler: I guessed that a handler can be async and that assigning `photo` after `await cam.takePhoto()` updates the page. I didn't wrap this in `@try`, because `takePhoto` is a method call inside a handler, not an async computed.

Tabs as tags: I guessed the parts are used as dotted tags (`<tabs.root>`, `<base.button>`). I also guessed that `tabs.root` with a `value` and `onChange` is the controlled pattern, so state `'camera'` makes Camera show first.

Styles: I guessed the inline `<style>` block. The guidance doesn't say how page CSS is attached, so the CSS might need to go in a separate stylesheet. I also guessed that `class` on `View` sizes the box, so `width: 100%` makes it fill the panel.

Camera while hidden: the camera's tab panel stays in the page when hidden, so I assume the camera keeps running (and `ready` stays true) while the Document tab shows. I didn't stop it.

Default camera: I assumed `camera()` with no options picks a sensible default, probably the back camera.

`@if` narrowing: I guessed that `@if (photo)` narrows `photo` to non-null inside its block.

Page label: I chose to show "Loading…" until `pages` is non-zero, and to disable Previous and Next at the ends.

## Website

Camera preview: after the browser's permission prompt, the visitor sees the browser's live camera picture, which can't be styled, in a box as wide as the panel. Each photo taken appears below it as an image.

PDF page: the visitor sees the browser's own built-in PDF viewer, possibly with its own toolbar, in a box as wide as the panel, opened at the current page.

Tools used: none
