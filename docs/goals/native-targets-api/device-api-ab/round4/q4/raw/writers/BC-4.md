```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = [
	{ id: 1, text: 'Great light in this one.' },
	{ id: 2, text: 'Try the Warm filter!' },
	{ id: 3, text: 'Love the framing.' },
];

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="backdrop">
			<drawer.content class="drawer" aria-label="Comments">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of comments; key comment.id) {
						<li>{comment.text}</li>
					}
				</ul>
				<drawer.close>Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera();
	let last = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.photo { display: block; width: 100%; height: auto; }
		`}</style>

		<base.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		<div class="controls">
			<button onClick={async () => (last = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>

		@if (last) {
			<img class="photo" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}

		<base.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
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
		</base.sheet>

		<Comments />
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so I made the flip button a toggle. `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`, ignoring the new pressed value. I'm assuming that a live `facing` field can drive `pressed`.
- I assumed an `async` arrow works as an `onClick` handler and that assigning the awaited `Photo` to state is fine. I added no error handling for when camera access is denied (`takePhoto` would reject).
- I assumed `@if (last)` narrows `last` to `Photo` inside the block.
- I assumed `{}` in text works on `state` variables directly, as in `<p>Filter: {filter}</p>`.
- I assumed a `<style>` element with a template-string child is accepted in `.tsrx` for page-width sizing. The guidance does not cover styling.
- I assumed the `Filters` and `Shutter` buttons may be plain `<button>`s, since only the flip button had to use `base.button`.
- I assumed `drawer.trigger` and `drawer.close` work without `onClick`, and the drawer runs uncontrolled (no `open` given).
- I assumed module-level constant arrays work with `@for` and `key`.
- I assumed `base.sheet` children can be one wrapping `<div>`.

## Website
Camera preview: the visitor sees the browser's camera picture after the browser asks for camera permission. Flip and shutter work through the same `Camera`.

Filters sheet: the browser's own `<dialog>` is shown at the bottom of the window with the browser's default look. It holds the same heading and three choice buttons.

Comments drawer: the same unstyled drawer as in the apps, drawn by my CSS. It is unstyled unless I add rules against its classes or `ui-*` attributes.

Note: not shown, because `platform.web` is true and `platform.ios` is false, even when the visitor uses an iPhone browser.

## Places
A: 1 place, the `filters` array (add the name). The `Filter` type follows from it.
B: 1 place, the `<h2>Choose a filter</h2>` text inside the sheet.

Tools used: none
