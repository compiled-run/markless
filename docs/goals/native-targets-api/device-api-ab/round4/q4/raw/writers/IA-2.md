```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, ios, android, web } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = [
	'Love the light in this one.',
	'Try the Warm filter!',
	'Great framing.',
];

function FilterChoices({ onChoose }: { onChoose: (name: Filter) => void }) @{
	<div class="filter-choices">
		<h2>Choose a filter</h2>
		<ul>
			@for (const name of FILTERS; key name) {
				<li>
					<button onClick={() => onChoose(name)}>{name}</button>
				</li>
			}
		</ul>
	</div>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="drawer-backdrop">
			<drawer.content class="drawer-content">
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
	let filtersOpen = state(false);

	const choose = (name: Filter) => {
		filter = name;
		filtersOpen = false;
	};

	<main>
		@if (platform.ios) {
			<ios.camera el={cam} class="preview" />
		}
		@if (platform.android) {
			<android.camera el={cam} class="preview" />
		}
		@if (platform.web) {
			<web.camera el={cam} class="preview" />
		}

		<p>Filter: {filter}</p>

		<div class="controls">
			<button onClick={async () => (photo = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<button onClick={() => (filtersOpen = true)}>Filters</button>
			<CommentsDrawer />
		</div>

		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		@if (platform.ios) {
			<ios.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
				<FilterChoices onChoose={choose} />
			</ios.sheet>
		}
		@if (platform.android) {
			<android.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
				<FilterChoices onChoose={choose} />
			</android.sheet>
		}
		@if (platform.web) {
			<web.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
				<FilterChoices onChoose={choose} />
			</web.sheet>
		}
	</main>
}
```

Confidence: 3/5

## Guesses

- `base.button` has no `onClick` prop, so I made the flip button a toggle button. Its `pressed` value follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I guessed that driving the pressed state from the camera's live `facing` field is allowed.
- I guessed that `@if (photo)` narrows `photo` from `Photo | null` to `Photo`, so `photo.url` type-checks inside the block.
- I guessed that a camera element sized to the page width with a `class="preview"` rule in the stylesheet (for example `width: 100%`) meets "fills the page width". I didn't write the stylesheet.
- I used three separate `@if` blocks, one per platform, instead of chaining `@else`. I wasn't sure `@else @if` is valid, and only one of the three is true in any build.
- I guessed that an async arrow handler (`async () => (photo = await cam.takePhoto())`) is fine as a click handler.
- I guessed that a module-level `as const` array and a `const` helper (`choose`) declared in the body are fine.
- I guessed the import path for the `Photo` type (`@markless/device`) and that `ios`, `android` and `web` can be imported from `@markless/ui`. The sheet lists those three under that module, but under a separate comment about system-drawn elements.
- The drawer is uncontrolled: `open` is left off and its own trigger and close parts open and close it. I put the "Comments" trigger inside the controls row.

## Website

- Camera preview: `web.camera` shows the browser's camera picture, sized by the `preview` class. Flip and Shutter work the same as in the apps.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, holding the same heading and three choices.
- Comments drawer: the same `drawer` family as in the apps. It is unstyled, so it looks however the author's stylesheet draws it.
- Note: not shown. `platform.web` is true on the website, so the iPhone-only note never renders, whatever device the visitor uses.

## Places

A: 1 place, the `FILTERS` array. The `Filter` type, the choice list and all three platform sheets come from it.

B: 1 place, the `<h2>` in `FilterChoices`. All three platform sheets render that one component.

Tools used: none
