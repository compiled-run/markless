```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = [
	{ id: 1, text: 'Love the light in this one.' },
	{ id: 2, text: 'Try Mono, it suits the shadows.' },
	{ id: 3, text: 'Flip to the front camera for a selfie!' },
];

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger class="open-comments">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel" aria-label="Comments">
				<drawer.title class="comments-title">Comments</drawer.title>
				<ul>
					@for (const comment of COMMENTS; key comment.id) {
						<li>{comment.text}</li>
					}
				</ul>
				<drawer.close class="close-comments">Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let sheetOpen = state(false);
	let filter = state<Filter | null>(null);

	<main class="capture">
		<style>{`
			.capture .preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.capture .last-photo { display: block; width: 100%; height: auto; }
			.comments-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); }
			.comments-panel { position: fixed; left: 0; right: 0; bottom: 0; padding: 1rem;
				background: white; border-radius: 12px 12px 0 0; }
		`}</style>

		<platform.camera el={cam} class="preview" />

		@if (filter !== null) {
			<p>Filter: {filter}</p>
		}

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
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<CommentsDrawer />
		</div>

		@if (photo !== null) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		<platform.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
			<div>
				<h2>Choose a filter</h2>
				@for (const name of FILTERS; key name) {
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
	</main>
}
```

Confidence: 3/5

## Guesses
- How to make the flip button: `base.button` has no `onClick`, and without `pressed` it never calls `onChange`. So I made it a toggle with `pressed={cam.facing === 'front'}` and call `cam.flip()` in `onChange`. I assumed `onChange` fires on every press.
- That a `<style>` block inside the root element is allowed in `.tsrx` and reaches the `class` on `<platform.camera>` and on the drawer parts. The guidance never mentions styling.
- That `@if (photo !== null)` narrows `photo` for TypeScript inside the block.
- That an `async` click handler that assigns state after `await` works (`takePhoto()` waits until the camera is ready). Its errors are not caught.
- That reading `cam.ready` and `cam.facing` in markup updates live, since the sheet says the fields are live.
- That setting `open` to false on `platform.sheet` closes the system sheet, and that `onChange(false)` is called only on a swipe down, not when I close it myself.
- That `<drawer.trigger>` and `<drawer.close>` work without an `onClick`, and that `drawer.root` with no `open` handles its own state.
- That `@for` over a readonly tuple, and over a plain non-state array, is allowed.
- That a text child next to `{filter}` in one `<p>` is fine.

## Website
- Camera preview: the browser's camera picture (after the browser asks for camera permission), filling the page width through the `preview` class. Flip switches cameras where the device has two.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look. It holds the same heading and three choices.
- Comments drawer: the same `@markless/ui` drawer as in the apps. The library adds no look, so the visitor sees only my styles.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place, the `FILTERS` array. The `Filter` type, the sheet's buttons and the "Filter: …" line all come from it.
B: 1 place, the `<h2>Choose a filter</h2>` inside `<platform.sheet>`.

Tools used: none
