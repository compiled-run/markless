```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, native } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Love the light here.', 'Try the Mono filter!', 'Great framing.'];

function Comments() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title class="comments-title">Comments</drawer.title>
				<ul>
					@for (const text of comments; key text) {
						<li>{text}</li>
					}
				</ul>
				<drawer.close class="comments-close">Close</drawer.close>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let filter = state<Filter>('None');
	let filtersOpen = state(false);

	<main class="capture">
		<style>{`
			.capture .preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.capture .last-photo { display: block; width: 100%; height: auto; }
		`}</style>

		<native.camera el={cam} class="preview" />

		<p>Filter: {filter}</p>

		<div class="controls">
			<button onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button
				pressed={cam.facing === 'front'}
				onChange={() => cam.flip()}
			>
				Flip camera
			</base.button>
			<button onClick={() => (filtersOpen = true)}>Filters</button>
			<Comments />
		</div>

		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}

		<native.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<div>
				<h2>Choose a filter</h2>
				<ul>
					@for (const name of filters; key name) {
						<li>
							<button
								onClick={() => {
									filter = name;
									filtersOpen = false;
								}}
							>
								{name}
							</button>
						</li>
					}
				</ul>
			</div>
		</native.sheet>

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop, so I made the flip control a toggle. It passes `pressed={cam.facing === 'front'}` and calls `cam.flip()` from `onChange`. I guessed that keeping `pressed` in step with the live `facing` field is the right pattern.
- `drawer.trigger` and `drawer.close` take `children` through `Div`. I used them uncontrolled: no `open` prop, so the trigger opens the drawer and Close closes it.
- I guessed that a `<style>` block with a template string works inside a `.tsrx` body. The guidance does not say how page styles are written.
- I guessed that `@if` without `@else` is allowed, and that `@if (photo)` narrows `photo` to non-null so `photo.url` type-checks.
- I guessed that an async arrow function used as a handler, assigning to state after `await`, is allowed outside `@try`. `takePhoto()` is a plain promise, not an async computed.
- I guessed that `key text` and `key name` on string arrays are valid keys.
- I guessed that `camera({ facing: 'back' })` is the right default and that the preview element starts the camera once it is mounted.

## Website
Camera preview: the browser's camera picture fills the page width; Take photo and Flip work through the browser camera, after the visitor allows camera access.
Filters sheet: the browser's own `<dialog>` at the bottom of the window, with the browser's default look and the same three choices.
Comments drawer: the same unstyled drawer as in the apps, drawn by my classes and stylesheet.
Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place: the `filters` array (`['None', 'Mono', 'Warm']`). The `Filter` type and the sheet's `@for` loop both come from it.
B: 1 place: the `<h2>Choose a filter</h2>` inside `native.sheet`.

Tools used: none
