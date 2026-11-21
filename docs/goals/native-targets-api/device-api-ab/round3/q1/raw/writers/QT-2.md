```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, modifierKey } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let lastPhoto = state<Photo | null>(null);
	let likes = state(0);
	let copied = state(false);

	const takePhoto = async () => {
		if (!camera.supported) return;
		lastPhoto = await cam.takePhoto();
	};

	const like = () => {
		likes++;
		haptics.tap('light');
	};

	const share = async () => {
		if (!sharesheet.supported) return;
		await sharesheet.open({ title, url });
	};

	const copyLink = async () => {
		await navigator.clipboard.writeText(url);
		copied = true;
	};

	<main>
		@if (network.supported && !net.online) {
			<div role="status" class="offline-banner">You are offline</div>
		}

		<h1>{title}</h1>

		@if (camera.supported) {
			<section>
				<base.camera el={cam} />
				<button onClick={takePhoto}>Take photo</button>
				@if (lastPhoto) {
					<img src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo taken" />
				}
			</section>
		} @else {
			<section>
				<p>The camera is available in the iPhone and Android apps.</p>
			</section>
		}

		@if (geolocation.supported) {
			<p>
				@if (geo.access === 'denied') {
					<span>Location access was refused. Allow it in Settings to see where you are.</span>
				} @else {
					<>
						@if (geo.position) {
							<span>
								You are at {geo.position.latitude.toFixed(4)}°, {geo.position.longitude.toFixed(4)}° (±{Math.round(geo.position.accuracy)} m)
							</span>
						} @else {
							<span>Finding you…</span>
						}
					</>
				}
			</p>
		} @else {
			<p>Your location is available in the iPhone and Android apps.</p>
		}

		<button onClick={like}>Like ({likes})</button>

		@if (sharesheet.supported) {
			<button onClick={share}>Share</button>
		} @else {
			<button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
		}

		<p>{modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed that a field read inside a nested `@if`, or inside the `@if (geo.position)` arm, still counts as guarded because it sits within the outer `@if (feature.supported)`.
- I assumed that `@if (lastPhoto)` and `@if (geo.position)` narrow the `null` away for the type checker in the template.
- I assumed that an `@if` block wrapped in `<>…</>` counts as the single node inside `@else`. I used that instead of `@else if`, because I don't know whether `@else if` is supported.
- I assumed that destructured props (`title`, `url`) can be used directly in handlers.
- I assumed that `navigator.clipboard` (a browser API, not part of the device package) is available in the website and Mac builds as the fallback for sharing.
- I assumed that a text node mixing literal text and `{}` expressions inside one `<span>` is fine.
- I assumed that `camera()`, `geolocation()` and `network()` can be created unguarded at the top of the body, as the sheet says, and do nothing in builds where the feature doesn't exist.

## Website
1. Camera: no preview and no button. Visitors see the message "The camera is available in the iPhone and Android apps."
2. Location: visitors see the message "Your location is available in the iPhone and Android apps." There is no "Finding you…" state and no refusal message.
3. Like: the button counts presses as normal. The haptic tap does nothing.
4. Offline banner: never shown, because the guarded banner is removed from the website build.
5. Share: a "Copy link" button copies the url to the clipboard and changes its label to "Link copied".
6. Hint: shows "Press ⌘K to search" on a Mac visitor's system and "Press Ctrl+K to search" for everyone else.

Tools used: Read (once, to read the instructions file)
