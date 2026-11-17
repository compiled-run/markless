```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, modifierKey } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();
	let photo = state<Photo | null>(null);
	let likes = state(0);

	<main>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}

		<h1>{title}</h1>

		<section>
			<base.camera el={cam} />
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			@if (photo) {
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
			}
		</section>

		<section>
			@if (geo.access === 'denied') {
				<p>Location access was refused, so we can't show where you are.</p>
			} @else {
				@if (geo.position) {
					<p>
						You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within{' '}
						{Math.round(geo.position.accuracy)} m)
					</p>
				} @else {
					<p>Finding you…</p>
				}
			}
		</section>

		<button
			onClick={() => {
				likes++;
				haptics.tap('light');
			}}
		>
			Like ({likes})
		</button>

		<button onClick={() => sharesheet.open({ title, url })}>Share</button>

		<p>{modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `@else { @if … }` nesting is allowed, since the guidance doesn't show an `@else @if` chain.
- I assumed an `async` arrow function works as an `onClick` handler, and that assigning state after an `await` updates the page.
- I assumed `disabled={!cam.ready}` and `{geo.position.latitude}` stay live because the guidance says device fields are live.
- I assumed narrowing with `@if (photo)` and `@if (geo.position)` type-checks inside the block.
- I assumed `<base.camera>` can sit next to other elements in the same parent.
- Nothing published lets my code tell which build it is running in. So the website behaviour below comes from the build removing device features, not from any branching I wrote.

## Website
1. The camera preview is empty. Because `ready` stays false, "Take photo" stays disabled, and no photo ever appears.
2. The page shows "Finding you…" forever, because `position` stays null and `access` stays 'unknown'. The refused-access message never shows.
3. The like button counts presses. There is no haptic tap.
4. The offline banner never shows, because `online` stays true.
5. The share button does nothing, because the promise never settles and no share panel opens.
6. The hint shows correctly for the visitor's system: "Press ⌘K to search" on Apple systems, "Press Ctrl+K to search" otherwise.

Tools used: Read (once, to read the instructions file)
