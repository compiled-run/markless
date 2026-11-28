```tsrx
// file: Post.tsrx
import { computed, state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, modifierKey } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let photo = state<Photo | null>(null);
	let likes = state(0);

	const locationText = computed(() => {
		if (geo.access === 'denied') return 'Location access was refused.';
		if (geo.position === null) return 'Finding you…';
		return `You are at ${geo.position.latitude.toFixed(5)}, ${geo.position.longitude.toFixed(5)} (±${Math.round(geo.position.accuracy)} m)`;
	});

	const searchHint = modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	<main>
		@if (!net.online) {
			<div role="status" class="offline-banner">You are offline</div>
		}

		<h1>{title}</h1>
		<p class="hint">{searchHint}</p>

		<section class="camera">
			<base.camera el={cam} class="preview" />
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			@if (photo !== null) {
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
			}
		</section>

		<p class="location">{locationText}</p>

		<button
			onClick={() => {
				likes++;
				haptics.tap('light');
			}}
		>
			Like ({likes})
		</button>

		<button onClick={() => sharesheet.open({ title, text: title, url })}>Share</button>
	</main>
}
```

Confidence: 3/5

## Guesses
- That `@if (photo !== null)` narrows `photo` to `Photo` inside the block. If it doesn't, `photo!.url` would be needed.
- That a sync `computed` can read the device object's live fields and recompute when they change.
- That reading a device feature's fields directly in markup (`net.online`, `cam.ready`) is reactive. The sheet says the fields are "live".
- That an `async` click handler that assigns state after `await` is allowed. On the website the promise never settles, so nothing happens.
- That `disabled={!cam.ready}` is a valid boolean attribute binding.
- That calling `haptics.tap` and `sharesheet.open` from handlers needs no per-component object, since they are module-level objects, not factory calls.
- That `modifierKey` is a plain constant and needs no `state`.

## Website
1. Camera: the preview area shows nothing and the "Take photo" button stays disabled, because `ready` stays false. No photo ever appears.
2. Location: shows "Finding you…" permanently. `position` stays null and `access` stays 'unknown', and the sheet offers no way to detect a build without device features, so the refused message never shows.
3. Like: the counter works normally. The haptic tap does nothing.
4. Offline banner: never shown, because `online` stays true.
5. Share: the button is shown but does nothing. The promise never settles and no share panel opens.
6. Hint: shows "Press ⌘K to search" to visitors on Apple systems and "Press Ctrl+K to search" to everyone else, based on the visitor's own system.

Tools used: Read (once, to read the instructions file only)
