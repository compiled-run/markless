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
	const hint = modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	<main>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<p>{hint}</p>

		<section>
			<base.camera el={cam} />
			@if (cam.access === 'denied') {
				<p>Camera access was refused.</p>
			}
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>
				Take photo
			</button>
			@if (photo !== null) {
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
			}
		</section>

		<section>
			@if (geo.access === 'denied') {
				<p>Location access was refused, so we can't show where you are.</p>
			} @else {
				<p>
					@if (geo.position === null) {
						<span>Finding you…</span>
					} @else {
						<span>{geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)</span>
					}
				</p>
			}
		</section>

		<section>
			<button
				onClick={() => {
					likes++;
					haptics.tap('light');
				}}
			>
				Like ({likes})
			</button>
			<button onClick={() => void sharesheet.open({ title, text: title, url })}>Share</button>
		</section>
	</main>
}
```

Confidence: 3/5

## Guesses
- I guessed that `@if` / `@else` works with no `@else if`, and that an `@if` inside a `<p>` counts as that block's one node.
- I guessed that `photo` and `geo.position` are narrowed to non-null inside the `@if` branch, so `photo.url` and `geo.position.latitude` type-check.
- I guessed that an `async` click handler is allowed and that assigning its awaited result to state updates the page.
- I guessed that member-style elements like `<base.camera el={cam} />` work in `.tsrx`, and that `disabled={...}` is a live attribute.
- I guessed that calling `sharesheet.open` without awaiting it is fine, and that `haptics.tap` in a handler needs no component ownership.
- The sheet gives no way to tell the website build from a phone build. So the website can't get a different message or a browser fallback (for example `navigator.share` or browser geolocation). I relied only on the documented "starting values" behaviour.
- I guessed that the camera `access` can be `'denied'` and is worth a message, even though the task doesn't ask for one.

## Website
1. The camera area shows nothing, and the "Take photo" button stays disabled because `ready` is never true. No photo ever appears.
2. The text stays on "Finding you…" forever, because `position` stays null and `access` stays 'unknown'. The sheet gives no way to detect the website and show something better, so this is a known weakness.
3. The like button counts presses normally. There is no haptic tap.
4. The offline banner never shows, because `online` stays true.
5. The share button does nothing: the call has no effect and its promise never settles.
6. The hint follows the visitor's system: "Press ⌘K to search" on Apple systems, "Press Ctrl+K to search" otherwise.

Tools used: Read (once, to read the instructions file)
