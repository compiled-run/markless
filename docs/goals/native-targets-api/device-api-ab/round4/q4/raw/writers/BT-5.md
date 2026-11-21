```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'];
const comments = ['Love the light here.', 'Try the Warm filter!', 'Great framing.'];

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const text of comments; key text) {
						<li>{text}</li>
					}
				</ul>
				<drawer.close>Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let lastPhoto = state<Photo | null>(null);
	let filter = state('None');
	let filtersOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>
		<camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<div>
			<button onClick={async () => (lastPhoto = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (filtersOpen = true)}>Filters</button>
			<Comments />
		</div>
		@if (lastPhoto) {
			<img class="last-photo" src={lastPhoto.url} alt="Last photo" />
		}
		<sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<div>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button
						onClick={() => {
							filter = name;
							filtersOpen = false;
						}}
					>
						{name}
					</button>
				}
			</div>
		</sheet>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so the flip button is a toggle button. `pressed` is tied to `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed a toggle can be driven from live camera state like this.
- I assumed a `<style>` block with a template-literal child is allowed inside the component for sizing the preview. The sheet says only that the camera element is sized with `class`, not where that CSS lives.
- I assumed an async arrow function works as an `onClick` handler and that assigning to state after `await` updates the page.
- I assumed `@if (lastPhoto)` narrows the type so `lastPhoto.url` is allowed inside it.
- I assumed `@for` works over a plain module-level array and that `key name` / `key text` are valid keys.
- I assumed that setting `filtersOpen = false` closes the system sheet when `open` is controlled.
- I assumed `drawer.trigger` and `drawer.close` work with only `children` and no `onClick`. The page also shows "Filter: None" at first, before anything is chosen.
- I assumed `type Photo` can be imported from `@markless/device`.

## Website
- Camera preview: the browser's own camera picture (after the browser asks for permission), full page width.
- Filters sheet: the browser's own `<dialog>` shown at the bottom of the window with the default browser look. It has the same heading and choices.
- Comments drawer: the same `drawer` behaviour as in the apps, drawn by my CSS. It has no styles unless the stylesheet supplies them, and the classes I used have no rules yet.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place: the `filters` array (add `'Sepia'`).
B: 1 place: the `<h2>Choose a filter</h2>` text inside the `<sheet>`.

Tools used: none
