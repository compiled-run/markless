```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Great light in this one.', 'Try the Mono filter!', 'Love the framing.'];

function Comments() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="drawer-backdrop">
			<drawer.content class="drawer-content" aria-label="Comments">
				<drawer.title class="drawer-title">Comments</drawer.title>
				<ul>
					@for (const text of comments; key text) {
						<li>{text}</li>
					}
				</ul>
				<drawer.close class="drawer-close">Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main class="capture">
		<camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
			<>
				<h2>Choose a filter</h2>
				<div class="filter-choices">
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
			</>
		</sheet>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `camera()` can be called in the component body, like `state()`, and that `cam.ready` and `cam.facing` stay up to date when read in markup and props.
- `base.button` has no `onClick`. I made the flip button a toggle (`pressed` follows `cam.facing === 'front'`) and call `cam.flip()` in `onChange`. I assumed the pressed state that comes back from the camera matches what the toggle flips to.
- The shutter is a native `<button>` with an async `onClick` that assigns the result of `await cam.takePhoto()` to state. I assumed that assignment updates the page.
- I assumed `@if (photo)` narrows the type so `photo.url` type-checks inside the block.
- I assumed the `sheet` takes several children. I wrapped them in a fragment to be safe.
- I assumed the drawer parts pass their children through, so text inside `drawer.trigger` and `drawer.close` shows as the button label.
- The camera fills the page width only through a `class="preview"` rule (`width: 100%`) in a stylesheet I did not write. The drawer looks are also left to that stylesheet.
- I put the `<Comments />` component inside the controls row. The drawer content may need to sit elsewhere for layering, but I assumed the drawer handles that.

## Website
- Camera preview: the browser's camera picture in the same box, after the browser asks for camera permission.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window, with the browser's default look and no grab handle or swipe to close.
- Comments drawer: the same `drawer` family as in the apps, unstyled except for my own CSS. It slides in from the bottom and can be dragged closed.
- Note: not shown, because `platform.ios` is false in the website build whatever device the visitor uses.

## Places
A: 1 place. Add `'Vivid'` to the `filters` array. The `Filter` type, the sheet choices and the "Filter:" line all come from that array.
B: 1 place. The `<h2>Choose a filter</h2>` text inside the `<sheet>`.

Tools used: none
