```tsx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, ios, android, web } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'];

const COMMENTS = [
	'Great light in this one.',
	'Try the Warm filter!',
	'Love the framing.',
];

function FilterChoices({ onPick }: { onPick: (name: string) => void }) @{
	<div class="filter-choices">
		<h2>Choose a filter</h2>
		<ul>
			@for (const name of FILTERS; key name) {
				<li>
					<button onClick={() => onPick(name)}>{name}</button>
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
	let last = state<Photo | null>(null);
	let filter = state('None');
	let sheetOpen = state(false);

	const pick = (name: string) => {
		filter = name;
		sheetOpen = false;
	};
	const setSheet = (open: boolean) => (sheetOpen = open);

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
			<button onClick={async () => (last = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<Comments />
		</div>

		@if (last !== null) {
			<img class="last-photo" src={last.url} alt="Last photo" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		@if (platform.ios) {
			<ios.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onPick={pick} />
			</ios.sheet>
		}
		@if (platform.android) {
			<android.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onPick={pick} />
			</android.sheet>
		}
		@if (platform.web) {
			<web.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onPick={pick} />
			</web.sheet>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick` prop, so the flip button is a toggle button: `pressed={cam.facing === 'front'}`, and `onChange` calls `cam.flip()`. I am assuming the toggle stays in step with `cam.facing` and that a zero-parameter handler is accepted where `onChange` expects one parameter.
- I am assuming a nested `@if` with no `@else` is allowed as a sibling inside `<main>`.
- I am assuming a plain `<style>` element with a template-string child is allowed in a `.tsrx` body for the full-width preview. The guidance does not mention styling.
- I am assuming `@if (last !== null)` narrows the type so that `last.url` type-checks.
- I am assuming an async arrow handler that assigns state (`last = await cam.takePhoto()`) works. There is no error handling if `takePhoto` rejects.
- I am assuming `@for` works over a plain module-level array and that `key name` / `key text` is valid.
- I am assuming the `ios`, `android` and `web` namespaces can be imported at the top of the file even though each exists in only one build. The sheet says only the use sites must sit inside the matching `@if`.
- I am assuming `drawer.trigger` and `drawer.close` work without an `onClick`, opening and closing the drawer by themselves because `open` is omitted.

## Website
- Camera preview: the browser's camera picture, which `web.camera` shows at full page width. The visitor gets a browser permission prompt first.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look, holding the heading and the three choices.
- Comments drawer: the same `drawer` family as in the apps. It is unstyled except for what the author adds.
- Note: not shown, because `platform.ios` is false in the website build even on an iPhone browser.

## Places
A: 1 place: the `FILTERS` array.
B: 1 place: the `<h2>` in `FilterChoices`.

Tools used: none
