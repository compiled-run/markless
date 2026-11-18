```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, native } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'];
const comments = ['Love the light here.', 'Try the Mono filter!', 'Great framing.'];

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content>
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of comments; key comment) {
						<li>{comment}</li>
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
		<native.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button onClick={async () => (lastPhoto = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Flip</base.button>
			<button onClick={() => (filtersOpen = true)}>Filters</button>
			<CommentsDrawer />
		</div>
		@if (lastPhoto) {
			<img src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<native.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<>
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
			</>
		</native.sheet>
		<style>
			{`.preview { display: block; width: 100%; }`}
		</style>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` in its signature, so the flip button is a toggle: `pressed` is set from `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed `pressed` follows `cam.facing` because the fields are live.
- I assumed `@if (lastPhoto)` narrows the type, so `lastPhoto.url` type-checks inside the block.
- I assumed an async arrow can be used as `onClick` and can assign state after `await`.
- I assumed `<style>` inside a `.tsrx` component is allowed and uses that `{`...`}` text form. The width rule could instead go in an app stylesheet.
- I assumed `@for` can loop over a module-level plain array, and that the sheet's children can be a fragment.
- I assumed `drawer.trigger` and `drawer.close` render buttons by themselves, so plain text children are enough.
- I left the drawer uncontrolled (no `open` prop). Its parts get no styles beyond the browser defaults.

## Website
- Camera preview: the browser's camera picture, after the visitor allows camera access, at full page width.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look.
- Comments drawer: the same unstyled drawer panel as in the apps (slides from the bottom, can be dragged closed). It has no styles, only what the author's CSS gives it.
- Note: not shown, because `platform.ios` is false on the website.

## Places
A: 1 place: the `filters` array (add `'Fourth'`).
B: 1 place: the `<h2>Choose a filter</h2>` text inside the sheet.

Tools used: none
