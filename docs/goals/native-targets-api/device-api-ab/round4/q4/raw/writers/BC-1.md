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
	{ id: 3, text: 'Love the angle.' },
];

function FilterSheet({ onPick }: { onPick: (name: Filter) => void }) @{
	let open = state(false);

	<div>
		<button onClick={() => (open = true)}>Filters</button>
		<base.sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				<ul>
					@for (const name of filters; key name) {
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

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
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
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let filter = state<Filter>('None');

	<main>
		<style>
			{`.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
			.comments-panel { position: fixed; left: 0; right: 0; bottom: 0; background: white; padding: 1rem; }`}
		</style>
		<base.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		<FilterSheet onPick={(name) => (filter = name)} />
		<CommentsDrawer />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- That a `<style>` block with a template string works inside a `.tsrx` page for styling the camera box and drawer. The guidance says nothing about where page styles go.
- The flip button: I gave `base.button` a `pressed` value (front camera = pressed) and call `cam.flip()` in `onChange`. I don't know if a controlled `pressed` that follows `cam.facing` clashes with the button's own toggling. The other option was a plain `base.button`, but it has no click callback, so it could not call `flip()`.
- That reading `cam.ready` / `cam.facing` in markup updates live ("its fields are live").
- That `@if (photo)` narrows `photo` to non-null inside the block.
- That an `async` click handler that assigns state after `await` is allowed.
- That a native `<button>` is fine for the shutter, the Filters button and the filter choices. Only the flip button had to be `base.button`.
- That `base.sheet` takes a single wrapping child, and that a callback prop with one parameter (`onPick`) is allowed.
- That `drawer.trigger` and `drawer.close` need no `onClick` to open and close the drawer when `open` is left off.
- That an `as const` tuple works as the `@for` source and that `key name` is a valid key.

## Website
- Camera preview: the browser's camera picture, after the browser asks for permission, sized by the `preview` class.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window, with the browser's default look.
- Comments drawer: the same unstyled drawer parts, styled only by my classes. Its behaviour (trigger, close, drag) is the same as in the apps.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 2 places: add `'Mono'`-style entry `'Sepia'` to the `filters` array, and the `Filter` type follows it automatically. The second place is any filter effect, but no effect is drawn, so in practice it is 1 place: the `filters` array.
B: 1 place: the `<h2>` text in `FilterSheet`.

Tools used: none
