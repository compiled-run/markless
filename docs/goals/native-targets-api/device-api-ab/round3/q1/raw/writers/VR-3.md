```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let lastPhoto = state<Photo | null>(null);
	let likes = state(0);

	const onMacWeb = platform.web && typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
	const searchHint = platform.macos || onMacWeb ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	async function snap() {
		if (!(platform.ios || platform.android)) return;
		lastPhoto = await cam.takePhoto();
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
		<h1>{title}</h1>

		@if ((platform.ios || platform.android) && !net.online) {
			<div role="status" class="offline">You are offline</div>
		}

		<p class="hint">{searchHint}</p>

		@if (platform.ios || platform.android) {
			<section>
				<base.camera el={cam} class="preview" />
				<button onClick={snap} disabled={!cam.ready}>Take photo</button>
				@if (lastPhoto) {
					<img src={lastPhoto.url} width={lastPhoto.width} height={lastPhoto.height} alt="Last photo taken" />
				}
			</section>
		} @else {
			<section>
				<p>The camera is available in the iPhone and Android apps.</p>
			</section>
		}

		@if (platform.ios || platform.android) {
			<section>
				@if (geo.access === 'denied') {
					<p>Location access was refused. You can allow it in Settings.</p>
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
			<section>
				<p>Your location is available in the iPhone and Android apps.</p>
			</section>
		}

		<button onClick={like}>Like ({likes})</button>
		<button onClick={share}>Share</button>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `@else` can follow `@if` with a block (`} @else {`), and that putting an `@if` inside an `@else` is the right way to write a three-way branch.
- I assumed `@if (platform.ios || platform.android) {…} @else {…}` counts as a guard, so reading `cam.ready`, `geo.access`, `geo.position` and showing `<base.camera>` inside it is accepted. I also assumed that `(platform.ios || platform.android) && !net.online` counts as a guard because it starts with the guard test.
- I assumed an early return (`if (!(platform.ios || platform.android)) return;`) is enough to guard `cam.takePhoto()` in the `snap` handler, and that `if (platform.ios || platform.android) { …; return; }` guards `sharesheet.open` in `share`.
- I assumed that making `camera()`, `geolocation()` and `network()` objects without a guard is harmless in the Mac and website builds, because the sheet says making a feature object "may stand anywhere".
- I assumed the `disabled` attribute can be bound to `!cam.ready`. The button would work without it, because `takePhoto` waits until the camera is ready.
- I assumed the website build runs on a server first, so every `navigator` read is wrapped in a `typeof` check. Detecting a Mac on the website from the user agent string may show a different hint on the server than in the browser when the page loads.
- I assumed the browser share and clipboard APIs (`navigator.share` and `navigator.clipboard`) are fine to use directly in a handler, and that `haptics.tap('light')` can be called with no guard.
- I assumed that if a photo was taken and the camera is then refused, it is fine to keep showing the last photo.

## Website
1. Camera: a note that the camera is available in the iPhone and Android apps. There is no preview and no "Take photo" button.
2. Location: a note that location is available in the iPhone and Android apps. There is no "Finding you…" state and no refused message.
3. Like: the button works and counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because the network feature does not exist in the website build.
5. Share: uses the browser's own share panel when the browser has one. Otherwise it copies the url to the clipboard.
6. Hint: "Press ⌘K to search" when the browser reports a Mac, otherwise "Press Ctrl+K to search".

Tools used: none
