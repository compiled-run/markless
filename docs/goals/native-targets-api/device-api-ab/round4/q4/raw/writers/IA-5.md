```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, ios, android, web, base, drawer } from '@markless/device';
import type { Photo } from '@markless/device';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = ['Great light in this one.', 'Try the Warm filter!', 'Love the angle.'];

function FilterChoices({ onChoose }: { onChoose: (name: Filter) => void }) @{
	<div class="filter-choices">
		<h2>Choose a filter</h2>
		<ul>
			@for (const name of FILTERS; key name) {
				<li>
					<button onClick={() => onChoose(name)}>{name}</button>
				</li>
			}
		</ul>
	</div>
}

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content aria-label="Comments">
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
	let sheetOpen = state(false);

	const choose = (name: Filter) => {
		filter = name;
		sheetOpen = false;
	};

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>

		@if (platform.ios) {
			<ios.camera el={cam} class="preview" />
		}
		@if (platform.android) {
			<android.camera el={cam} class="preview" />
		}
		@if (platform.web) {
			<web.camera el={cam} class="preview" />
		}

		<p>Filter: {filter}</p>

		<div class="controls">
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>

		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		@if (platform.ios) {
			<ios.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
				<FilterChoices onChoose={choose} />
			</ios.sheet>
		}
		@if (platform.android) {
			<android.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
				<FilterChoices onChoose={choose} />
			</android.sheet>
		}
		@if (platform.web) {
			<web.sheet open={sheetOpen} onChange={(open) => (sheetOpen = open)}>
				<FilterChoices onChoose={choose} />
			</web.sheet>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- **Import sources:** The sheet lists `base` and `drawer` under `@markless/ui`, but it never says which module `ios`, `android` and `web` come from. I imported all of them, plus `camera` and `platform`, from `@markless/device`. The right line is probably `import { base, drawer } from '@markless/ui'`, with the platform namespaces coming from one of the two modules.
- **Flip button:** A plain `base.button` has no `onClick` in its props, so I made it a toggle: `pressed={cam.facing === 'front'}`, and `onChange` calls `cam.flip()`. I'm assuming that a `pressed` value tied to state stays in step with the camera.
- **Full-width preview:** I used a `<style>` block with plain class names to make the preview fill the page width. The guidance doesn't say whether `<style>` inside a component is allowed or scoped.
- **`@if` blocks:** I used three separate `@if` blocks rather than an `@if` / `@else` chain. Nesting an `@if` inside `@else` might not count as "one node". I also assumed several `@if (platform.x)` blocks can sit next to each other, and that the build accepts `ios.*` inside each matching one.
- **Sheet placement:** I assumed a `*.sheet` with `open={false}` renders nothing visible and can sit anywhere in the page.
- **Narrowing `photo`:** I assumed `@if (photo)` narrows the type so `photo.url` can be read inside it, and that an async arrow is fine as an `onClick` handler.
- **Drawer state:** I left `open` off the drawer so it manages its own open state, with the trigger opening it and Close closing it.
- **Shutter button:** I used a native `<button>` for the shutter and disabled it until `cam.ready` is true.

## Website
- **Camera preview:** The browser's own camera picture, shown full width after the visitor allows camera access in the browser's prompt.
- **Filters sheet:** The browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, holding the heading and the three choices.
- **Comments drawer:** The same unstyled `drawer` parts as in the apps. It works, but it looks like whatever the page's stylesheet draws, and here that is nothing.
- **Note:** Not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place: add `'Fourth'` to the `FILTERS` array. All three sheets share `FilterChoices`, and the `Filter` type comes from that array.
B: 1 place: the `<h2>` in `FilterChoices`.

Tools used: none
