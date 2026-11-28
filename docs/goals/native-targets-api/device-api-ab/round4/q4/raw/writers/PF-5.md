```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = [
	'Love the light in this one.',
	'Try the Warm filter!',
	'Great framing.',
];

function FilterSheet({ open, onChoose }: { open: boolean; onChoose: (choice: Filter | null) => void }) @{
	<platform.sheet open={open} onChange={(next) => { if (!next) onChoose(null); }}>
		<div class="filter-sheet">
			<h2>Choose a filter</h2>
			<ul>
				@for (const name of filters; key name) {
					<li>
						<button onClick={() => onChoose(name)}>{name}</button>
					</li>
				}
			</ul>
		</div>
	</platform.sheet>
}

function Comments() @{
	<drawer.root>
		<>
			<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
			<drawer.backdrop class="comments-backdrop">
				<drawer.content class="comments-panel">
					<>
						<drawer.title class="comments-title">Comments</drawer.title>
						<ul class="comments-list">
							@for (const text of comments; key text) {
								<li>{text}</li>
							}
						</ul>
						<drawer.close class="comments-close">Close</drawer.close>
					</>
				</drawer.content>
			</drawer.backdrop>
		</>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let lastPhoto = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main class="capture">
		<platform.camera el={cam} class="preview" />
		<p class="filter-label">Filter: {filter}</p>

		<div class="controls">
			<button onClick={async () => (lastPhoto = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>

		@if (lastPhoto) {
			<img class="last-photo" src={lastPhoto.url} alt="Last photo" />
		}

		@if (platform.ios) {
			<p class="note">Photos also save to your library.</p>
		}

		<FilterSheet
			open={sheetOpen}
			onChoose={(choice) => {
				if (choice) filter = choice;
				sheetOpen = false;
			}}
		/>

		<Comments />
	</main>
}

<style>
	.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
	.last-photo { display: block; width: 100%; }
	.comments-panel { position: fixed; inset: auto 0 0 0; background: white; padding: 1rem; }
</style>
```

Confidence: 3/5

## Guesses
- The sheet says `base.button` has no `onClick`. So the flip button is a toggle: `pressed` is tied to `cam.facing === 'front'`, and `onChange` calls `cam.flip()`.
- That an async `onClick` handler is fine, and that `lastPhoto` narrows inside `@if (lastPhoto)`.
- That `filter` and `sheetOpen` can be reassigned inside a callback passed to a child component.
- That `<platform.sheet>` and `<drawer.*>` work as JSX tags with dotted names. Also that a child slot counts as a "block" and needs one node, so I wrapped siblings in `<>…</>` inside `drawer.root` and `drawer.content`.
- That the drawer starts closed and opens and closes on its own when `open` is left off.
- That a swipe-down close (`onChange(false)`) should leave the filter unchanged.
- The `<style>` block placement and the class names.
- That `cam.facing` is live, so the toggle state follows it.

## Website
- Camera preview: the browser's camera picture, after the browser asks for camera permission, sized full width by `.preview`.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look, holding the heading and three choices.
- Comments drawer: the same `@markless/ui` drawer as in the apps, drawn only by my CSS.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place: add `'Cool'` to the `filters` array. The type and the list come from it.
B: 1 place: the `<h2>` text inside `FilterSheet`.

Tools used: none
