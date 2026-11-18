```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, ios, android, web } from '@markless/ui';

const FILTERS = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof FILTERS)[number];

const COMMENTS = ['Love the light here.', 'Try the Warm filter!', 'Great framing.'];

function FilterChoices({ onChoose }: { onChoose: (name: Filter) => void }) @{
	<div class="filters">
		<h2>Choose a filter</h2>
		@for (const name of FILTERS; key name) {
			<button onClick={() => onChoose(name)}>{name}</button>
		}
	</div>
}

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop class="comments-backdrop">
			<drawer.content class="comments" aria-label="Comments">
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
			<button onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
			<button onClick={() => (sheetOpen = true)}>Filters</button>
		</div>

		@if (photo) {
			<img class="last-photo" src={photo.url} alt="Last photo" />
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

		<Comments />

		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses

- `base.button` has no `onClick`, so I made the flip button a toggle. `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed that `pressed` stays in sync with the live `facing` field.
- I assumed an `async` arrow is allowed as an `onClick` handler and that assigning to state after `await` works.
- I assumed `@if (photo)` narrows `photo` to `Photo` inside the block.
- I assumed sibling `@if` blocks are fine, because I did not know whether `@else if` exists. I also assumed that a `web.*`/`ios.*`/`android.*` element inside its matching `@if (platform.X)` satisfies the build check.
- I assumed a `<style>` element with a template-string child is an acceptable way to size the preview, and that no `@layer` or scoping rules apply.
- I assumed that passing `choose` as a one-parameter callback prop is allowed, and that `key name` and `key text` work with plain string keys.
- I assumed `drawer.trigger` and `drawer.close` work without an `onClick`. The sheet says they open and close the drawer by themselves.
- I assumed that importing a type, as in `type Photo`, from `@markless/device` is fine.

## Website

- Camera preview: the browser's camera picture, full page width. It appears after the visitor grants permission.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window, in the browser's default look, holding the heading and the three filter buttons.
- Comments drawer: the same `drawer` as in the apps. It is unstyled, so it looks like whatever my stylesheet draws, and I wrote no styles for it.
- Note: not shown, because `platform.ios` is false in the website build whatever device the visitor uses.

## Places

A: 1 place. Add the name to the `FILTERS` array. The type, the buttons and the three sheets all come from it.

B: 1 place. Edit the `<h2>` in `FilterChoices`, which all three platform sheets share.

Tools used: none (I read the task file only to get these instructions)
