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
	let photo = state<Photo | null>(null);
	let likes = state(0);
	const macVisitor =
		platform.macos ||
		(platform.web && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));

	const takePhoto = async () => {
		if (!(platform.ios || platform.android)) return;
		photo = await cam.takePhoto();
	};

	const like = () => {
		likes++;
		haptics.tap('light');
	};

	const share = async () => {
		if (platform.ios || platform.android) {
			await sharesheet.open({ title, url });
			return;
		}
		if (typeof navigator !== 'undefined' && navigator.share) {
			await navigator.share({ title, url });
		} else if (typeof navigator !== 'undefined' && navigator.clipboard) {
			await navigator.clipboard.writeText(url);
		}
	};

	<main>
		@if ((platform.ios || platform.android) && !net.online) {
			<div class="banner">You are offline</div>
		}

		<h1>{title}</h1>

		<section>
			@if (platform.ios || platform.android) {
				<>
					<base.camera el={cam} />
					<button onClick={takePhoto} disabled={!cam.ready}>Take photo</button>
					@if (photo !== null) {
						<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
					}
				</>
			} @else {
				<p>The camera is available in the iPhone and Android apps.</p>
			}
		</section>

		<section>
			@if (platform.ios || platform.android) {
				<>
					@if (geo.access === 'denied') {
						<p>Location access was refused, so we can't show where you are.</p>
					} @else {
						<>
							@if (geo.position === null) {
								<p>Finding you…</p>
							} @else {
								<p>
									You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
								</p>
							}
						</>
					}
				</>
			} @else {
				<p>Your location is shown in the iPhone and Android apps.</p>
			}
		</section>

		<button onClick={like}>Like ({likes})</button>
		<button onClick={share}>Share</button>

		@if (macVisitor) {
			<p class="hint">Press ⌘K to search</p>
		} @else {
			<p class="hint">Press Ctrl+K to search</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I guessed that a guard combined with another condition (`(platform.ios || platform.android) && !net.online`) counts as a guard, because the test starts with the guard shape.
- I guessed that reading a feature object (`cam.ready`, `geo.position`) inside a nested `@if` or attribute within a guarded arm counts as guarded.
- I guessed that a fragment `<>…</>` holding a nested `@if`/`@else` counts as one node in an `@else` arm. I used that in place of an `@else if` chain, which the guidance does not mention.
- I assumed the `photo` state (a plain `Photo` I stored) needs no guard of its own. It is also inside the guard anyway.
- I assumed `navigator.share` and `navigator.clipboard` are fine to use in a handler on the website, and that the `navigator` check in the body is safe if the page renders on the server. Detecting a Mac website visitor through `navigator.platform` is my own choice, because `platform.web` says nothing about the visitor's system.
- I assumed an unawaited branch of the share handler is fine, since the sharesheet call is guarded by the early-return shape.

## Website
1. Camera: a note that the camera is available in the iPhone and Android apps. No preview and no button.
2. Location: a note that location is shown in the apps. No prompt, no "Finding you…".
3. Like: the counter works. The haptic tap does nothing.
4. Offline banner: never shown.
5. Share: uses the browser's own share panel where there is one. Otherwise it copies the url to the clipboard.
6. Hint: "Press ⌘K to search" if the browser reports a Mac, otherwise "Press Ctrl+K to search".

Tools used: Read (once, to open the instruction file as the study asked). No other tools.
