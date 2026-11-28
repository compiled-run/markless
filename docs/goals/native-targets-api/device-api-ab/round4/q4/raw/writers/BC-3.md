```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Great light in this one.', 'Try the warm filter!', 'Love the angle.'];

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
	let lastPhoto = state<Photo | null>(null);
	let filter = state<Filter>('None');

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>
		<base.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					lastPhoto = await cam.takePhoto();
				}}
			>
				Shutter
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (lastPhoto) {
			<img
				class="last-photo"
				src={lastPhoto.url}
				width={lastPhoto.width}
				height={lastPhoto.height}
				alt="Last photo"
			/>
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
- **Flip button:** `base.button` has no `onClick`. A plain `base.button` (no `pressed`) gives no way to react to a press, so I made it a toggle: `pressed` is tied to `cam.facing === 'front'` and `onChange` calls `cam.flip()`. I assumed the camera's live `facing` field keeps the toggle state in sync.
- **Async handler:** I assumed an `async` handler can assign state after an `await` (`lastPhoto = await cam.takePhoto()`), and that a rejected promise just fails quietly. I did not handle errors.
- **Null check:** I assumed `@if (lastPhoto)` narrows the type, so reading `lastPhoto.url` inside the block is allowed.
- **Styling:** I assumed a `<style>` element with a template string is valid inside the root element and styles the camera box through `class`. The guidance does not say how to attach a stylesheet.
- **Drawer text:** I assumed `drawer.trigger`, `drawer.title` and `drawer.close` render their children as button or heading text. I also assumed leaving out `open` gives a self-managed drawer that the trigger and close button control.
- **Closing the sheet:** I assumed setting `open = false` in the sheet's state closes the system sheet in code. I also assumed `onChange(false)` fires only on a swipe down, so my `onChange` handler mirrors it.
- **`@if` and constants:** I assumed `@if` works without `@else`. I also assumed module-level `const` arrays can be used in `@for` and passed as plain values.
- **Shutter button:** I disabled the shutter until `cam.ready`. I did not handle `cam.access === 'denied'`.
- **Callback prop:** `onPick` takes one parameter, which fits the rule that a callback prop takes at most one.

## Website
- **Camera preview:** The visitor sees the browser's camera picture at full page width, after the browser asks for camera permission. Flip and shutter work through the browser camera.
- **Filters sheet:** It opens as the browser's own `<dialog>` at the bottom of the window with the browser's default look. Picking a filter closes it and updates "Filter: …".
- **Comments drawer:** It is the same author-styled `drawer` as in the apps: unstyled unless the stylesheet styles it, and it slides in from the bottom.
- **Note:** The visitor does not see it. `platform.web` is true and `platform.ios` is false on the website, even on an iPhone browser.

## Places
A: 1 place. Add the name to the `filters` array. The `Filter` type and the sheet's list both come from it.

B: 1 place. The `<h2>Choose a filter</h2>` text in `FilterSheet`.

Tools used: none
