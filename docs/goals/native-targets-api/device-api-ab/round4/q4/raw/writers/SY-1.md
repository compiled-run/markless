```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, system } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
const comments = ['Great light here.', 'Try the back camera.', 'Warm suits this one.'];

function Comments() @{
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

function FilterSheet({ onPick }: { onPick: (name: string) => void }) @{
	let open = state(false);

	<>
		<button onClick={() => (open = true)}>Filters</button>
		<system.sheet open={open} onChange={(next) => (open = next)}>
			<div>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button
						onClick={() => {
							onPick(name);
							open = false;
						}}
					>
						{name}
					</button>
				}
			</div>
		</system.sheet>
	</>
}

export default function Capture() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let filter = state('None');

	<main>
		<style>{`
			.preview { display: block; width: 100%; aspect-ratio: 3 / 4; }
			.last-photo { display: block; width: 100%; height: auto; }
		`}</style>
		<system.camera el={cam} class="preview" />
		<p>Filter: {filter}</p>
		<div>
			<button
				disabled={cam.access === 'denied'}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Shutter
			</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<FilterSheet onPick={(name) => (filter = name)} />
			<Comments />
		</div>
		@if (photo) {
			<img class="last-photo" src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- `base.button` has no `onClick`, so the flip button is a toggle button. I used `pressed={cam.facing === 'front'}` and call `cam.flip()` from `onChange`, and I assumed the live `facing` field keeps `pressed` in sync.
- An async `onClick` handler that assigns state after `await` (`photo = await cam.takePhoto()`) is allowed, and it can be used outside `@try` because `photo` is plain state, not an async computed.
- `@if (photo)` narrows `photo` to `Photo` inside the block.
- A `<>…</>` fragment is a valid single root for a component body, and the `<div>` inside `system.sheet` is fine as the sheet's children.
- Styling: I guessed that a `<style>` element with a template-literal child works. The guidance doesn't say how page CSS is written, so this could belong in a stylesheet instead.
- `drawer.trigger` and `drawer.close` open and close the drawer themselves with no `open` state, as the sheet describes. The drawer parts accept plain text children.
- A `readonly` tuple (`as const`) works with `@for`, and `key name` / `key text` work as keys for strings.
- `camera()` asks for permission by itself when its element is on screen. I didn't add a separate permission prompt.

## Website
- Camera preview: the browser's camera picture, full width, after the visitor allows camera access. The shutter and flip buttons work the same way as in the apps.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look. Choosing a filter closes it and updates "Filter: …".
- Comments drawer: the same `drawer` family as in the apps, drawn by my own styles. It slides up from the bottom and has a Close button.
- Note: not shown, because `platform.ios` is false in the website build, whatever device the visitor uses.

## Places
A: 1 place: the `filters` array (add the name).
B: 1 place: the `<h2>Choose a filter</h2>` text in `FilterSheet`.

Tools used: none
