```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, haptics, network, platform, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let photo = state<Photo | null>(null);
	let likes = state(0);

	const onMac =
		platform.macos ||
		(platform.web && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent));

	async function snap() {
		if (!(platform.ios || platform.android)) return;
		photo = await cam.takePhoto();
	}

	function like() {
		likes++;
		haptics.tap('light');
	}

	async function share() {
		if (platform.ios || platform.android) {
			await sharesheet.open({ title, url });
			return;
		}
		if (typeof navigator !== 'undefined' && navigator.share) {
			await navigator.share({ title, url });
		} else if (typeof navigator !== 'undefined' && navigator.clipboard) {
			await navigator.clipboard.writeText(url);
		}
	}

	<main>
		@if ((platform.ios || platform.android) && !net.online) {
			<div role="status" class="offline-banner">You are offline</div>
		}

		<h1>{title}</h1>

		@if (platform.ios || platform.android) {
			<section class="camera">
				<base.camera el={cam} />
				<button onClick={snap}>Take photo</button>
				@if (photo) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</section>
		} @else {
			<section class="camera">
				<p>The camera is available in the iPhone and Android apps.</p>
			</section>
		}

		@if (platform.ios || platform.android) {
			<section class="location">
				@if (geo.access === 'denied') {
					<p>Location access was refused, so we can't show where you are.</p>
				} @else {
					@if (geo.position) {
						<p>
							You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
						</p>
					} @else {
						<p>Finding you…</p>
					}
				}
			</section>
		} @else {
			<section class="location">
				<p>Your location is available in the iPhone and Android apps.</p>
			</section>
		}

		<button onClick={like}>Like ({likes})</button>

		<button onClick={share}>Share</button>

		<p class="hint">{onMac ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed that `@if`s nested inside a guarded `@if`, such as the `geo.access`, `geo.position` and `photo` tests, count as guarded and need no guard of their own.
- I assumed that calling `camera()`, `geolocation()` and `network()` in the body with no guard is fine on every build, as the sheet says, and that the objects do nothing where the feature does not exist.
- I assumed that a handler `if (guard) { …; return; }` followed by web code counts as a guard, and that the code after it is what other builds get, like an `@else` arm. I added the negated early return in `snap` (`if (!(platform.ios || platform.android)) return;`) to be safe.
- I assumed that `@if` / `@else` with a nested `@if` counts as "one node", and that `@if` with no `@else` is allowed.
- I assumed that `navigator.share` and `navigator.clipboard` exist in the website and Mac builds, and that touching `navigator` during server rendering is avoided by the `typeof` checks.
- To detect a Mac visitor on the website, I read the user agent once when the page is set up. A server-rendered page may show "Ctrl+K" first, until it runs in the browser.
- I assumed that props `title` and `url` can be read as plain values in handlers.
- I assumed that `photo.width` and `photo.height` work as `<img>` attributes, and that narrowing on `geo.position` holds inside the block.

## Website
1. Camera: no preview and no button. A note says the camera is available in the iPhone and Android apps.
2. Location: a note says location is available in the apps. There is no "Finding you…" state and no refused message.
3. Like: the button works and the count goes up. There is no haptic tap, because the call does nothing on the web.
4. Offline banner: never shown, because the website build has no device network feature.
5. Share: uses the browser's share panel (`navigator.share`) where it exists. Otherwise it copies the url to the clipboard.
6. Hint: "Press ⌘K to search" for visitors whose browser reports a Mac, and "Press Ctrl+K to search" for everyone else.

Tools used: Read (once, to read the instructions file)
