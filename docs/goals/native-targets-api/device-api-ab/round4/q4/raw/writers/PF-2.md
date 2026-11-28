```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'];
const comments = ['Love the light here.', 'Try the Warm filter!', 'Great framing.'];

function FilterSheet({ onPick }: { onPick: (name: string) => void }) @{
	let open = state(false);

	<div>
		<button onClick={() => (open = true)}>Filters</button>
		<platform.sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button
						onClick={() => {
							open = false;
							onPick(name);
						}}
					>
						{name}
					</button>
				}
			</div>
		</platform.sheet>
	</div>
}

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
	let filter = state<string | null>(null);

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>

		<platform.camera el={cam} class="preview" />

		@if (filter !== null) {
			<p>Filter: {filter}</p>
		}

		<div>
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>
				Take photo
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip camera
			</base.button>
		</div>

		@if (photo !== null) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
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

`base.button` has no `onClick` prop. To make the flip button work, I made it a toggle: `pressed` follows `cam.facing === 'front'`, and `onChange` calls `cam.flip()`. I assumed `pressed` is controlled, so it updates when `facing` changes.

I assumed `<platform.camera>` and `<platform.sheet>` can be written as JSX tags, since they are member expressions on `platform`.

I assumed a plain `<style>` element inside the page is how CSS is added. The guidance does not mention styling, apart from `class` on the camera element.

I assumed an async arrow handler that sets state after `await cam.takePhoto()` is allowed. I also assumed that inside `@if (photo !== null)` the type of `photo` narrows, so `photo.url` reads correctly.

The "Filter: …" line appears only after a choice is made. Before that, nothing is shown.

The shutter is a plain `<button>`, disabled until `cam.ready`. The guidance did not ask for `base.button` there.

The drawer is uncontrolled (it has no `open` prop). Its trigger and close parts render as buttons. Their text is passed as children, and I assumed they need no `onClick`.

Inside the sheet, I wrapped the heading and buttons in one `<div>`, and the button plus sheet in another `<div>`, so each block holds exactly one node.

## Website

Camera preview: the browser's live camera picture, full page width, after the visitor grants permission.

Filters sheet: the browser's own `<dialog>`, shown at the bottom of the window with the default browser look, holding the heading and the three choices.

Comments drawer: the same unstyled `drawer` parts as in the apps. It looks bare unless the author's CSS styles the `ui-*` attributes.

Note: not shown, because `platform.ios` is false in the website build.

## Places

A: 1 place: add `'…'` to the `filters` array.

B: 1 place: the `<h2>Choose a filter</h2>` text in `FilterSheet`.

Tools used: none
