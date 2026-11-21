```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, system } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
const comments = ['Great light!', 'Try the Warm filter.', 'Nice framing.'] as const;

function Comments() @{
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
	let filter = state<string>('None');
	let sheetOpen = state(false);

	<main>
		<style>{`.preview { display: block; width: 100%; }`}</style>
		<system.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<div>
			<button onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
		<system.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
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
		</system.sheet>
		<Comments />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop, so I made the flip button a toggle. Its `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I am assuming that a `pressed` prop driven by the camera's live `facing` field stays in sync.
- I assumed `@if (photo)` narrows `photo` so `photo.url` type-checks inside the block.
- I assumed a `<style>` element inside the page is the right way to make the preview fill the page width, since the guidance doesn't say how styling works. Plain CSS in the app's global stylesheet would also work.
- I assumed an async arrow handler (`await cam.takePhoto()`) that assigns state is allowed outside `@try`. That should hold because `takePhoto` is a normal promise, not an async computed.
- I assumed `@for` works over a plain constant array and that `key text` / `key name` are valid keys.
- I assumed the drawer's `drawer.trigger` and `drawer.close` handle opening and closing by themselves when `open` is omitted.
- I assumed the `system.sheet` children need one wrapping element.
- I assumed `import { type Photo }` from `@markless/device` is fine.

## Website
- Camera preview: the browser's camera picture, full width. The browser will ask for camera permission first.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window, with the browser's default look and the same three choices.
- Comments drawer: the same unstyled `drawer` family as in the apps, drawn by my CSS. It works the same way on the website.
- Note: not shown, because `platform.web` is true and `platform.ios` is false.

## Places
A: 1 place: the `filters` array (add `'Name'`).
B: 1 place: the `<h2>Choose a filter</h2>` inside `system.sheet`.

Tools used: none
