```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, system } from '@markless/device';
import type { Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const SHEET_HEADING = 'Choose a filter';

const COMMENTS = [
	{ id: 1, text: 'Love the light in this one.' },
	{ id: 2, text: 'Try the Mono filter!' },
	{ id: 3, text: 'Great framing.' },
];

function FilterSheet({ open, onChange, onPick }: {
	open: boolean;
	onChange: (open: boolean) => void;
	onPick: (filter: Filter) => void;
}) @{
	<system.sheet open={open} onChange={onChange}>
		<div class="sheet-body">
			<h2>{SHEET_HEADING}</h2>
			<ul>
				@for (const name of FILTERS; key name) {
					<li>
						<button onClick={() => onPick(name)}>{name}</button>
					</li>
				}
			</ul>
		</div>
	</system.sheet>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="drawer-backdrop">
			<drawer.content class="drawer-content">
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of COMMENTS; key comment.id) {
						<li>{comment.text}</li>
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
	let filter = state<Filter>('None');
	let sheetOpen = state(false);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
			.drawer-content { background: white; padding: 1rem; }
		`}</style>

		<system.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>

		<div class="controls">
			<button onClick={async () => { lastPhoto = await cam.takePhoto(); }}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
			<CommentsDrawer />
		</div>

		@if (lastPhoto) {
			<img class="last-photo" src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo" />
		}

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}

		<FilterSheet
			open={sheetOpen}
			onChange={(open) => (sheetOpen = open)}
			onPick={(name) => {
				filter = name;
				sheetOpen = false;
			}}
		/>
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so I made the flip button a toggle: `pressed={cam.facing === 'front'}` and `onChange` calls `cam.flip()`. I'm assuming `pressed` follows `cam.facing`, which updates live.
- I assumed a plain `<button onClick={async …}>` can take the photo and then assign the result to state after the `await`. The shutter is not wrapped in `@try`, so if `takePhoto()` rejects, the error is not handled.
- I assumed the camera class and full-width layout can be styled from a `<style>` element inside the page, and that a template string inside `{}` works there.
- I assumed `drawer.trigger` and `drawer.close` open and close the drawer on their own, with no state or `onClick` needed.
- I assumed `@if (lastPhoto)` narrows the type away from `null`, and that a component can receive `open` as a plain `boolean` prop and still follow the parent's state.
- I assumed module-level constant arrays can be looped over with `@for` in the same way state can.
- I assumed `<system.sheet>` closing on a swipe down calls `onChange(false)`, which keeps `sheetOpen` in step.

## Website
- Camera preview: the browser's camera picture, full width. The browser asks permission first.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look. It holds the same heading and three buttons.
- Comments drawer: the same unstyled drawer as in the apps, styled only by the page's own CSS.
- Note: not shown, because `platform.ios` is false in the website build.

## Places
A: 1 place, the `FILTERS` array (add `'Name'`). The `Filter` type comes from that array.
B: 1 place, the `SHEET_HEADING` constant.

Tools used: none
