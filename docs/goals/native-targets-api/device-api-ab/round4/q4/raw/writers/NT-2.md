```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, native, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = ['Great light in this one.', 'Try the Warm filter!', 'Nice framing.'];

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
	let lastPhoto = state<Photo | null>(null);
	let filter = state<Filter | null>(null);
	let sheetOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>

		<native.camera el={cam} class="preview" />

		@if (filter !== null) {
			<p>Filter: {filter}</p>
		}

		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (lastPhoto = await cam.takePhoto())}>
				Shutter
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>

		@if (lastPhoto !== null) {
			<img class="last-photo" src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		<native.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
			<>
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
			</>
		</native.sheet>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`. A plain `base.button` therefore has no way to report a press, so I made the flip button a toggle: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed the toggle can be controlled this way, meaning it shows `pressed` as given rather than keeping its own state.
- That `Photo` is exported as a type and can be imported with `type Photo`.
- That an async arrow function works as an `onClick` handler, and that assigning to state after `await` updates the page.
- That `@if (lastPhoto !== null)` narrows the type, so `lastPhoto.url` typechecks inside the block.
- That a `<style>` element inside the component, with a template-string child, is the right way to make the preview fill the page width. A plain stylesheet holding the same rules would also work.
- That the shutter can be disabled with `cam.ready`. `takePhoto()` waits until the camera is ready anyway, so this only stops early presses.
- That the native sheet's children are allowed to be a fragment holding a heading plus a `@for`.
- That setting `sheetOpen = false` closes the system sheet when the page changes it, not just when the person swipes down.
- That the drawer works uncontrolled (no `open` prop), with `drawer.trigger` opening it and `drawer.close` closing it.
- That "Filter: …" should appear only after a choice has been made, rather than starting as "Filter: None".

## Website
Camera preview: the browser's camera picture in the same box, after the browser asks the visitor for camera permission.
Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, holding the same heading and choices.
Comments drawer: the same drawer built from my unstyled parts, so it looks however my stylesheet draws it, the same as in the apps.
Note: not shown. `platform.ios` is false in the website build, even when the visitor is on an iPhone.

## Places
A: 1 place. Add the name to the `filters` array. The `Filter` type and the sheet's buttons are both built from that array.
B: 1 place. The `<h2>Choose a filter</h2>` text inside `native.sheet`.

Tools used: Read (only to open the task file; nothing else)
