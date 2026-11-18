```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = [
	{ id: 1, text: 'Great light in this one.' },
	{ id: 2, text: 'Try the Mono filter!' },
	{ id: 3, text: 'Flip to the front camera for a selfie.' },
];

function FilterSheet({ onPick }: { onPick: (filter: Filter) => void }) @{
	let open = state(false);

	<div>
		<button onClick={() => (open = true)}>Filters</button>
		<base.sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				<ul>
					@for (const name of FILTERS; key name) {
						<li>
							<button
								onClick={() => {
									open = false;
									onPick(name);
								}}
							>
								{name}
							</button>
						</li>
					}
				</ul>
			</div>
		</base.sheet>
	</div>
}

function Comments() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of COMMENTS; key comment.id) {
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

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
			.comments-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); }
			.comments-panel { position: fixed; left: 0; right: 0; bottom: 0; background: white; padding: 1rem; border-radius: 12px 12px 0 0; }
		`}</style>
		<base.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					last = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (last) {
			<img class="last-photo" src={last.url} width={last.width} height={last.height} alt="Last photo" />
		}
		<FilterSheet onPick={(name) => (filter = name)} />
		<Comments />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`. To make flip a toggle, I set `pressed={cam.facing === 'front'}`, and its `onChange` calls `cam.flip()`. I assumed that a `pressed` value which follows the camera's live `facing` stays in sync with the button's own flip.
- The shutter is a native `<button>` with an async `onClick`, because a plain `base.button` has no documented press callback.
- I assumed `drawer.trigger` and `drawer.close` render buttons and open or close the drawer on their own when `open` is left off. I also assumed `drawer.backdrop` needs to be positioned by the author.
- I assumed `base.sheet` accepts a wrapping `<div>` as its children, and that setting `open = false` closes the system sheet.
- I assumed a `<style>` element with a template string inside the page is an acceptable way to style things. The guidance says nothing about styling.
- I assumed TypeScript narrows `last` inside `@if (last)` so that `last.url` type-checks. I also assumed a callback prop like `onPick` can be passed a typed function.
- I assumed `as const` arrays work with `@for` and `key name`.
- I assumed `disabled={!cam.ready}` is fine to read in the body. `takePhoto` waits for the camera to be ready anyway.

## Website
Camera preview: the browser's camera picture, after the browser asks for camera permission, filling the page width.
Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look (no native grab handle or swipe-to-close).
Comments drawer: the same `drawer` family drawer as in the apps, styled only by my CSS.
Note: not shown, because `platform.web` is true and `platform.ios` is false, whatever device the visitor uses.

## Places
A: 1 place, the `FILTERS` array (add `'Name'`). The type and the list both come from it.
B: 1 place, the `<h2>Choose a filter</h2>` in `FilterSheet`.

Tools used: none (apart from the one Read of the task file, which the task told me to make)
