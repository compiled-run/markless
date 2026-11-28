```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = ['Love the light here.', 'Try the Warm filter!', 'Great framing.'];

function FilterSheet({ onPick }: { onPick: (name: Filter) => void }) @{
	let open = state(false);

	<>
		<button onClick={() => (open = true)}>Filters</button>
		<platform.sheet open={open} onChange={(next) => (open = next)}>
			<section>
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
			</section>
		</platform.sheet>
	</>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments-panel">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const text of COMMENTS; key text) {
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
		<platform.camera el={cam} class="preview" />
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
- `base.button` has no `onClick` prop, so I made the flip button a toggle button. Its `pressed` value comes from `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I'm assuming the camera's live `facing` field keeps `pressed` in sync and that the toggle doesn't fight the value I pass in.
- That a handler can be `async` and assign the awaited photo to state (`photo = await cam.takePhoto()`).
- That `@if (photo)` narrows `photo` to non-null inside the block.
- That a `<style>` block inside a `.tsrx` component is allowed, and how its CSS is written. The guidance doesn't mention style blocks.
- That a callback prop (`onPick`) passed from parent to child can assign the parent's state.
- That `platform.sheet` accepts a `<section>` wrapper as its child. I closed it by setting `open = false` myself, and I'm not sure that also calls `onChange(false)`.
- That the drawer works uncontrolled, with no `open` or `onChange`: `drawer.trigger` opens it and `drawer.close` closes it. Whether `drawer.trigger` and `drawer.close` render as real buttons is also a guess.
- That `import { type Photo }` from `@markless/device` works.
- I disabled the shutter until `cam.ready`, even though `takePhoto` already waits until the camera is ready.

## Website
- Camera preview: the browser's camera picture in a box that fills the page width, after the browser's permission prompt. Shutter and flip work as in the apps.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, holding the heading and three choices.
- Comments drawer: the same unstyled drawer as in the apps (the `@markless/ui` drawer is not platform-specific). It looks the way my CSS draws it, which is barely at all here.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1, the `FILTERS` array (add the name). The `Filter` type, the list of choices and the label all come from it.
B: 1, the `<h2>Choose a filter</h2>` text in `FilterSheet`.

Tools used: none
