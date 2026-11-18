```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'];
const comments = ['Great light in this one.', 'Try the Warm filter!', 'Love the angle.'];

function Comments() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title class="comments-title">Comments</drawer.title>
				<ul>
					@for (const comment of comments; key comment) {
						<li>{comment}</li>
					}
				</ul>
				<drawer.close class="comments-close">Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let sheetOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>
		<platform.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
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
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		<platform.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
			<div>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button
						onClick={() => {
							filter = name;
							sheetOpen = false;
						}}
					>
						{name}
					</button>
				}
			</div>
		</platform.sheet>
		<Comments />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop, so I made the flip button a toggle: `pressed` follows `cam.facing === 'front'` and `onChange` calls `cam.flip()`. I assumed it accepts `pressed` from live camera state and doesn't fight it.
- I assumed a plain `<button>` is fine for the shutter and the Filters button, since only the flip button had to use `base.button`.
- I assumed an async `onClick` that assigns to state after `await` works.
- I assumed `@if (photo)` narrows `Photo | null` so that `photo.url` type-checks.
- I assumed a `<style>` block with a template string works inside a `.tsrx` component. The guidance doesn't cover it, but the camera element only takes `class`, so the width needs a stylesheet.
- I assumed setting `sheetOpen = false` closes the system sheet, as a controlled `open` prop should.
- I assumed `drawer.trigger` and `drawer.close` open and close the drawer with no `onClick`, since the uncontrolled mode is described that way.
- I assumed `<style>` before the root's content and the `@for` inside the sheet's `<div>` keep to the one-node rules.
- I disabled the shutter until `cam.ready`, even though `takePhoto` waits for ready anyway.

## Website
- Camera preview: the browser's camera picture, full width, after the visitor allows camera access in the browser.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look, holding the heading and the three buttons.
- Comments drawer: the same unstyled `drawer` parts as in the apps, styled only by my classes and `ui-*` attributes.
- Note: not shown, because in the website build `platform.ios` is false whatever device the visitor uses.

## Places
A: 1 place, the `filters` array.
B: 1 place, the `<h2>Choose a filter</h2>` in the sheet.

Tools used: Read (only to open the task file, as instructed; nothing else)
