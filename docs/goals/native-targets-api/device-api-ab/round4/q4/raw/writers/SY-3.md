```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base, drawer, system } from '@markless/ui';

const filters = ['None', 'Mono', 'Warm'] as const;
type Filter = (typeof filters)[number];

const comments = [
	{ id: 1, text: 'Great light in this one.' },
	{ id: 2, text: 'Try the Mono filter!' },
	{ id: 3, text: 'Love the angle.' },
];

function FilterSheet({ onPick }: { onPick: (name: Filter) => void }) @{
	let open = state(false);

	<>
		<button onClick={() => (open = true)}>Filters</button>
		<system.sheet open={open} onChange={(next) => (open = next)}>
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
		</system.sheet>
	</>
}

function CommentsDrawer() @{
	<drawer.root>
		<drawer.trigger>Comments</drawer.trigger>
		<drawer.backdrop>
			<drawer.content>
				<drawer.title>Comments</drawer.title>
				<ul>
					@for (const comment of comments; key comment.id) {
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

	<main>
		<system.camera el={cam} class="capture-preview" />
		<p>Filter: {filter}</p>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<div>
			<button onClick={async () => (lastPhoto = await cam.takePhoto())}>Shutter</button>
			<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>
				Flip
			</base.button>
			<FilterSheet onPick={(name) => (filter = name)} />
			<CommentsDrawer />
		</div>
		@if (lastPhoto) {
			<img src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo" />
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- The sheet doesn't say whether a plain `base.button` (no `pressed`) calls `onChange`, and it has no `onClick`. So I made Flip a toggle with `pressed={cam.facing === 'front'}` and used `onChange` to call `cam.flip()`. I assumed that when `pressed` is passed in from outside, the button follows that value and doesn't keep its own copy.
- "Fills the page width" assumes a stylesheet rule like `.capture-preview { width: 100%; }`. I didn't write the stylesheet, and the guidance doesn't say where styles go.
- I assumed the drawer parts accept text children. The `Div` type says `children?: unknown`, so they should. I also assumed `drawer.close` closes the drawer by itself, with no state of mine.
- I assumed `@if (lastPhoto)` narrows the type so `lastPhoto.url` type-checks, and that an async handler that assigns state after `await` works.
- I assumed `<>…</>` is allowed as a component's one root element.
- I assumed the sheet passes its `onChange(false)` on a swipe down, so syncing `open` from `onChange` keeps it correct.
- I assumed `import { type Photo }` from `@markless/device` works, since `Photo` is exported as an interface.

## Website
- Camera preview: the browser's own camera picture in the same box, after the browser asks for camera permission. Flip calls `cam.flip()`, but whether a laptop has a second camera is unknown.
- Filters sheet: the browser's own `<dialog>` at the bottom of the window with the browser's default look (no grab handle or swipe-to-close). Choosing a filter still closes it and updates "Filter: …".
- Comments drawer: the same drawer as in the apps, because it is author-drawn and unstyled, so it looks however my stylesheet draws it.
- Note: not shown. `platform.web` is true and `platform.ios` is false on every device, even an iPhone browser.

## Places
A: 1 place: add `'Cool'` (or another name) to the `filters` array. The `Filter` type and the sheet's list both come from that array.
B: 1 place: the `<h2>Choose a filter</h2>` text in `FilterSheet`.

Tools used: none
