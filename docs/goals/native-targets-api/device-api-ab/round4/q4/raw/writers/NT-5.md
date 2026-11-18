```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, native, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = ['Great light in this one.', 'Try the Warm filter!', 'Love the angle.'];

function FilterSheet({ onPick }: { onPick: (filter: Filter) => void }) @{
	let open = state(false);

	<>
		<button onClick={() => (open = true)}>Filters</button>
		<native.sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				<ul>
					@for (const name of FILTERS; key name) {
						<li>
							<button
								onClick={() => {
									onPick(name);
									open = false;
								}}
							>
								{name}
							</button>
						</li>
					}
				</ul>
			</div>
		</native.sheet>
	</>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger class="comments-trigger">Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title class="comments-title">Comments</drawer.title>
				<ul>
					@for (const text of COMMENTS; key text) {
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

	<main>
		<native.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div class="controls">
			<button onClick={async () => (photo = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<FilterSheet onPick={(name) => (filter = name)} />
			<CommentsDrawer />
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed a stylesheet sets `.preview { width: 100%; }` and `.last-photo { width: 100%; height: auto; }`. The sheet says the camera element is sized with `class`, but it doesn't say where the CSS goes.
- `base.button` has no `onClick`. To make it act as a plain button I gave it `pressed`, tied to `cam.facing === 'front'`, and used `onChange` to call `cam.flip()`. That makes Flip a toggle that shows when the front camera is on.
- I assumed I can import `Photo` as a type with `import { type Photo }` from `@markless/device`.
- I assumed that inside `@if (photo)`, TypeScript narrows away the `null` so `photo.url` type-checks.
- I assumed an async handler that assigns state (`photo = await cam.takePhoto()`) is allowed, and that this `computed`-free use is fine.
- I assumed `drawer.trigger` and `drawer.close` accept text children, since `Div` has `children`, and need no `onClick` to work.
- I assumed a component can use a fragment `<>…</>` as its one root, and that `@for` over a module-level constant array works.
- I assumed a callback prop with one parameter (`onPick`) can assign state in the parent.

## Website
- Camera preview: the browser's camera picture, at full page width through the class.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the default browser look; choosing a filter closes it.
- Comments drawer: the same unstyled `drawer` parts as in the apps, sliding up from the bottom edge, drawn by my CSS.
- Note: not shown, because `platform.web` is true and `platform.ios` is false on the website, whatever device the visitor uses.

## Places
A: 1 place, the `FILTERS` array. The `Filter` type, the `@for` loop and the shown label all follow from it.
B: 1 place, the `<h2>Choose a filter</h2>` inside `FilterSheet`.

Tools used: none
