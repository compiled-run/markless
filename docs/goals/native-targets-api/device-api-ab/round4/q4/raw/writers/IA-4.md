```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, ios, android, web, base, drawer } from '@markless/device';
import type { Photo } from '@markless/device';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
const SHEET_HEADING = 'Choose a filter';
const COMMENTS = ['Great light here.', 'Try the back camera.', 'Mono suits this one.'];

function FilterChoices({ onChoose }: { onChoose: (name: string) => void }) @{
	<div>
		<h2>{SHEET_HEADING}</h2>
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
			<drawer.content>
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
	let filter = state('None');
	let sheetOpen = state(false);

	const choose = (name: string) => {
		filter = name;
		sheetOpen = false;
	};
	const setSheet = (open: boolean) => (sheetOpen = open);

	<main>
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

		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Shutter
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>

		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}

		@if (platform.ios) {
			<ios.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onChoose={choose} />
			</ios.sheet>
		}
		@if (platform.android) {
			<android.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onChoose={choose} />
			</android.sheet>
		}
		@if (platform.web) {
			<web.sheet open={sheetOpen} onChange={setSheet}>
				<FilterChoices onChoose={choose} />
			</web.sheet>
		}

		<Comments />

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- **Import module:** the sheet shows two modules but no import path for the `ios`, `android` and `web` namespaces. I guessed they come from `@markless/device`. I also guessed that `base` and `drawer` come from `@markless/ui`, but I wrote the import as `@markless/device`. It should probably be split into two imports: `import { base, drawer } from '@markless/ui'` and the rest from `@markless/device`.
- **Flip button:** `base.button` has no `onClick`. I made it a toggle button (`pressed={cam.facing === 'front'}`) and call `cam.flip()` from `onChange`. This assumes `onChange` fires on every press and that `pressed` follows the camera's live `facing` value.
- **Full-width preview:** the `preview` class is assumed to set `width: 100%` from a stylesheet I did not write.
- **Plain buttons:** I assumed plain `<button onClick>` works for the shutter, Filters and choice buttons. I also assumed an async arrow handler is fine, and that `cam.ready` can be read in `disabled`.
- **Closing the sheet:** I assumed setting `open` to false closes the system sheet, and that `onChange(false)` also fires when the website's `<dialog>` is dismissed.
- **Three `@if` blocks:** I used separate `@if (platform.x)` blocks instead of an `@else if` chain, because I don't know if `@else @if` is allowed.
- **Drawer buttons:** I assumed `drawer.trigger` and `drawer.close` open and close the drawer with no `open` state passed in.
- **Comment keys:** I used each comment's text as its `@for` key.

## Website
- **Camera preview:** `web.camera` shows the browser's camera picture, after the browser's permission prompt.
- **Filters sheet:** the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look.
- **Comments drawer:** the same `drawer` family as in the apps. It slides up from the bottom and looks the way the app's stylesheet draws it.
- **Note:** not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place, the `FILTERS` array. All three platform sheets use the same `FilterChoices` component.
B: 1 place, the `SHEET_HEADING` constant.

Tools used: none
