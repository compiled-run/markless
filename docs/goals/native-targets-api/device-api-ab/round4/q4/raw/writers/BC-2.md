```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
const comments = ['Love the light here.', 'Try the Mono filter!', 'Great framing.'];

function FilterSheet({ onPick }: { onPick: (name: string) => void }) @{
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
		</base.sheet>
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
	let filter = state('None');

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
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} alt="Last photo" />
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
- `base.button` has no `onClick`, so I used it as a toggle (`pressed` follows `cam.facing === 'front'`) and called `flip()` from `onChange`. I assumed the controlled `pressed` value stays in step with `cam.facing`.
- I assumed a plain `<button>` with `onClick` is allowed alongside the ui family, and that an async handler can assign to state after an `await`.
- I assumed a `<style>` element with a template string is a valid way to style parts, and that `class` reaches the drawer parts and the camera box.
- I assumed `@if (photo)` narrows `photo`, so `photo.url` type-checks.
- I assumed `drawer.trigger` and `drawer.close` work with no `onClick` when `open` is left off.
- I assumed `<base.sheet>` accepts a single wrapping `<div>` as its children, and that setting `open = false` closes it without problems.
- I assumed `cam.ready` can be read in the body to disable the shutter. `takePhoto()` waits until ready anyway.

## Website
- Camera preview: the browser's camera picture, full width, after the browser asks for camera permission.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with its default look, holding the heading and three choices.
- Comments drawer: the same drawer as in the apps, drawn by my styles, sliding up from the bottom.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place: the `filters` array.
B: 1 place: the `<h2>` inside `FilterSheet`.

Tools used: none
