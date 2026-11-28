```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = ['Love the light here.', 'Try the Warm filter!', 'Great framing.'];

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content>
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of COMMENTS; key comment) {
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
	let photo = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; }
			.last-photo { display: block; width: 100%; }
		`}</style>
		<camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
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
		</sheet>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop in the sheet, so a plain `base.button` could not trigger anything. I made it a toggle (`pressed` tied to `cam.facing === 'front'`) and call `cam.flip()` from `onChange`. I am assuming the controlled `pressed` value follows `cam.facing`.
- Children of `drawer.trigger` and `drawer.close` become the button text. These parts open and close the drawer without any handler from me.
- `@for` body: I assumed one `<button>` per item counts as "exactly one node", and that iterating over a module-level constant array works.
- An async arrow in `onClick` that assigns `photo = await ...` works. `takePhoto` waits until the camera is ready by itself.
- `@if (photo)` narrows `photo` to `Photo` inside the block.
- A `<style>` block inside the component is allowed and its `class` rules reach the camera element and the `<img>`. The guidance does not mention styling, so the way I made the preview full width is a guess.
- Native lowercase `<button onClick>` gets a native event, as usual.
- The sheet's `onChange(false)` on swipe down is handled by writing `sheetOpen` back.
- Filters are a typed `as const` tuple, so `filter = name` type-checks.

## Website
Camera preview: the browser's camera picture, full width, after the browser's permission prompt. Shutter and flip still work.
Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look (no system grab handle or swipe).
Comments drawer: the same unstyled `drawer` family as in the apps, so it looks however my stylesheet draws it (here, barely styled).
Note: not shown, because `platform.web` is true and `platform.ios` is false on the website, even on an iPhone browser.

## Places
A: 1, the `FILTERS` array (add the new name). The type, the sheet buttons and the "Filter: …" label all come from it.
B: 1, the `<h2>Choose a filter</h2>` text inside the `<sheet>`.

Tools used: none
