```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Great light in this one.', 'Try the Mono filter!', 'Love the angle.'];

function FilterSheet({ onChoose }: { onChoose: (name: Filter) => void }) @{
	let open = state(false);

	<div>
		<button onClick={() => (open = true)}>Filters</button>
		<sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				<ul>
					@for (const name of filters; key name) {
						<li>
							<button
								onClick={() => {
									onChoose(name);
									open = false;
								}}
							>
								{name}
							</button>
						</li>
					}
				</ul>
			</div>
		</sheet>
	</div>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const text of comments; key text) {
						<li>{text}</li>
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
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>
		<camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button onClick={async () => (photo = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		<FilterSheet onChoose={(name) => (filter = name)} />
		<CommentsDrawer />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so I made the flip button a toggle button: `pressed={cam.facing === 'front'}` and `onChange` calls `cam.flip()`. I assumed `pressed` follows the live `cam.facing` field.
- I assumed an async arrow function works as an `onClick` handler and that assigning the awaited `takePhoto()` result to state is fine.
- I assumed `@if (photo)` narrows `Photo | null` to `Photo` inside the block.
- I assumed a `<style>` element with a template-string child works for page CSS. The camera element only takes `class`, so its width has to come from a stylesheet.
- I assumed plain `<button>` elements are fine inside `<sheet>`, and that setting `open = false` closes the sheet. I also assumed a single `<div>` wrapper is needed because a block holds one node.
- I assumed `drawer.trigger` and `drawer.close` work with no `onClick` (the sheet says they open and close the drawer themselves). I assumed the drawer needs no `open` prop, since it starts closed when `open` is omitted.
- I assumed a `const` array defined at module level can be used with `@for`.
- The shutter button is a plain `<button>`; the task only asked for the flip button to use `base.button`.

## Website
- Camera preview: the browser's camera picture, full page width, after the visitor allows camera access.
- Filters sheet: the browser's own `<dialog>` shown at the bottom of the window with the browser's default look, holding the heading and the three choices.
- Comments drawer: the same drawer as in the apps, with no styles except the classes I gave it (it needs a stylesheet to look like a panel).
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1, the `filters` array (`['None', 'Mono', 'Warm']`). The `Filter` type comes from that array, so it updates too.
B: 1, the `<h2>Choose a filter</h2>` inside `FilterSheet`.

Tools used: none
