```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, native, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'];
const comments = ['Great light here.', 'Try the Warm filter!', 'Nice framing.'];

function FilterSheet({ onPick }: { onPick: (name: string) => void }) @{
	let open = state(false);

	<>
		<button onClick={() => (open = true)}>Filters</button>
		<native.sheet open={open} onChange={(next) => (open = next)}>
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
		</native.sheet>
	</>
}

function Comments() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content>
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
	let filter = state('None');

	<main>
		<style>{`.preview { display: block; width: 100%; aspect-ratio: 3 / 4; } .last { width: 100%; }`}</style>
		<native.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					lastPhoto = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>
		@if (lastPhoto !== null) {
			<img class="last" src={lastPhoto.url} alt="Last photo" />
		}
		<FilterSheet onPick={(name) => (filter = name)} />
		<Comments />
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- The sheet says nothing about how a page adds its own styles, so I put the full-width preview rule in a `<style>` element inside the page.
- `base.button` has no `onClick`, so the flip button is a toggle button: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed that letting the camera's live `facing` field drive `pressed` keeps the two in step.
- Inside `@if (lastPhoto !== null)`, I assumed `lastPhoto.url` is narrowed to a non-null type and reads correctly.
- I assumed an async `onClick` handler that assigns to state after `await` is allowed.
- I assumed the native sheet needs a single wrapping child (a `<div>`), and that setting `open = false` from a choice closes it.
- I left the drawer uncontrolled (no `open`), so its trigger opens it and its close button closes it. I also assumed drawer parts accept plain text as children.
- I assumed `Photo` is exported as a type from `@markless/device`. The sheet shows it as `export interface`, so this is likely.
- The photo is only shown, not filtered. The task asks only for the label "Filter: Mono" and does not ask to apply the filter.

## Website
- Camera preview: the browser's camera picture, after the visitor allows camera access in the browser's prompt.
- Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the browser's default look, not the iPhone or Android sheet.
- Comments drawer: the same unstyled drawer as in the apps, drawn by my own styles.
- Note: not shown, because `platform.ios` is false in the website build whatever device the visitor uses.

## Places
A: 1 place: add the name to the `filters` array.
B: 1 place: the `<h2>` text in `FilterSheet`.

Tools used: none
