```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = [
	{ id: 1, text: 'Great light in this one.' },
	{ id: 2, text: 'Try the Mono filter!' },
	{ id: 3, text: 'Love the framing.' },
];

function FilterSheet({ open, onPick }: { open: boolean; onPick: (choice: Filter | null) => void }) @{
	<sheet open={open} onChange={(next) => { if (!next) onPick(null); }}>
		<div class="filter-sheet">
			<h2>Choose a filter</h2>
			<ul>
				@for (const name of filters; key name) {
					<li>
						<button onClick={() => onPick(name)}>{name}</button>
					</li>
				}
			</ul>
		</div>
	</sheet>
}

function Comments() @{
	<drawer.root>
		<>
			<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
			<drawer.backdrop class="comments-backdrop">
				<drawer.content class="comments-panel">
					<>
						<drawer.title class="comments-title">Comments</drawer.title>
						<ul>
							@for (const comment of comments; key comment.id) {
								<li>{comment.text}</li>
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
	let photo = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main class="capture">
		<camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div class="controls">
			<button onClick={async () => (photo = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
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
		<FilterSheet
			open={sheetOpen}
			onPick={(choice) => {
				if (choice) filter = choice;
				sheetOpen = false;
			}}
		/>
	</main>
}
```

```css
// file: styles/capture.css
.preview { display: block; width: 100%; }
.last-photo { display: block; width: 100%; }
.comments-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); }
.comments-panel { position: fixed; left: 0; right: 0; bottom: 0; background: white; padding: 1rem; border-radius: 12px 12px 0 0; }
.comments-backdrop:not([ui-open]) { display: none; }
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop, so I made the flip button a toggle button. Its `pressed` value comes from `cam.facing === 'front'`, and its `onChange` calls `cam.flip()`. I assumed the control stays in step with `facing`.
- I assumed an async arrow function works as an `onClick` handler outside `@try`, since it calls `takePhoto()` and does not read an async computed.
- I assumed `@if (photo)` narrows `photo` so that `photo.url` type-checks inside the block.
- I assumed `<drawer.root>` and the other parts take a single child, so I wrapped siblings in `<>…</>`. I also assumed their text children render as the button labels.
- I assumed a component can keep `cam.facing` live in props and read it directly in JSX.
- I guessed the stylesheet setup: how `styles/capture.css` gets loaded, and that the backdrop carries `ui-open`. The sheet passes nothing on how styles are attached.
- I assumed the sheet's `onChange(false)` fires on a swipe-down. I also assumed that changing `open` to false from code closes the sheet without calling `onChange`.

## Website
- Camera preview: the browser's camera picture, full width, after the browser's permission prompt.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the default browser look. It has the heading and three buttons, and choosing one closes it.
- Comments drawer: the same `drawer` family behaviour (it opens, closes and can be dragged closed). It looks only as my stylesheet draws it.
- Note: not shown, because `platform.web` is true and `platform.ios` is false.

## Places
A: 1 place, the `filters` array. The `Filter` type comes from that array, and the sheet list is built from it.
B: 1 place, the `<h2>Choose a filter</h2>` inside `FilterSheet`.

Tools used: none
