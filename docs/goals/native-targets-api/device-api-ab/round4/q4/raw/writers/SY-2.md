```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, system } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Great light here!', 'Try the back camera.', 'Mono suits this one.'] as const;

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content>
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
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main>
		<style>{`.preview { display: block; width: 100%; aspect-ratio: 3 / 4; } .last { display: block; width: 100%; height: auto; }`}</style>
		<system.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button disabled={!cam.ready} onClick={async () => (lastPhoto = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Flip camera</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>
		@if (lastPhoto) {
			<img class="last" src={lastPhoto.url} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<system.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
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
		</system.sheet>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`. So the flip button is a toggle: `pressed` is tied to `cam.facing === 'front'`, and `onChange` calls `cam.flip()`.
- The page shows "Filter: None" before anything is chosen. I treated None as the starting filter.
- To make the preview fill the page width, I put a `<style>` element inside the page. The guidance doesn't say how styles are written, and it may expect an external stylesheet instead.
- I assumed `@if (lastPhoto)` narrows the type so `lastPhoto.url` type-checks, and that an async arrow handler that assigns state is allowed.
- I assumed `drawer.trigger` and `drawer.close` open and close the drawer with no `open` or `onChange` wiring.
- I assumed `@for` works over a constant array with `key` set to the string itself.
- I assumed a `{name}` choice button with no `onChange` on the sheet still closes it when `sheetOpen` is set to `false`.
- I disable the shutter until `cam.ready`. `takePhoto` would wait anyway, so this is optional.

## Website
- Camera preview: the browser's camera picture, shown after the visitor allows camera access, at full page width.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, holding the heading and the three filter buttons.
- Comments drawer: the same drawer as in the apps, an unstyled panel that slides in from the bottom and is styled by the author.
- Note: not shown, because `platform.web` is true and `platform.ios` is false.

## Places
A: 1 place, the `filters` array (`['None', 'Mono', 'Warm']`).
B: 1 place, the `<h2>Choose a filter</h2>` text inside `system.sheet`.

Tools used: Read (to open the task file only)
