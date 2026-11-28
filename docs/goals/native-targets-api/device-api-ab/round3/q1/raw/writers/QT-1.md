```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, modifierKey } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera();
	const geo = geolocation();
	const net = network();
	let photo = state<Photo | null>(null);
	let likes = state(0);
	let copied = state(false);

	const takePhoto = async () => {
		if (!camera.supported) return;
		photo = await cam.takePhoto();
	};

	const like = () => {
		likes++;
		haptics.tap('light');
	};

	const share = async () => {
		if (!sharesheet.supported) return;
		await sharesheet.open({ title, text: title, url });
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
				<button onClick={takePhoto} disabled={!cam.ready}>Take photo</button>
				@if (photo !== null) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</section>
		} @else {
			<section>
				<p>The camera is available in the iPhone and Android apps.</p>
			</section>
		}

		@if (geolocation.supported) {
			<section>
				@if (geo.access === 'denied') {
					<p>Location access was refused. Allow it in your device settings to see where you are.</p>
				} @else {
					<>
						@if (geo.position === null) {
							<p>Finding you…</p>
						} @else {
							<p>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
							</p>
						}
					</>
				}
			</section>
		} @else {
			<section>
				<p>Your location is available in the iPhone and Android apps.</p>
			</section>
		}

		<button onClick={like}>Like ({likes})</button>

		@if (sharesheet.supported) {
			<button onClick={share}>Share</button>
		} @else {
			<button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
		}

		<p>Press {modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed that inline JS like `photo.url` and the `? :` ternary are allowed inside `{}`, and that `disabled={!cam.ready}` works as an attribute expression.
- I assumed a handler defined in the component body counts as guarded when it uses an early `if (!feature.supported) return;`. I added those returns even though the handlers are only used inside `@if` arms.
- I assumed `@if … @else` can be nested, and that a fragment `<>…</>` counts as one node.
- I assumed that making `camera()`, `geolocation()` and `network()` unguarded in the body is fine on the website and Mac builds. The sheet says making a feature object "may stand anywhere".
- I assumed `geo.access === 'denied'` is the right test for "refused". While access is `'unknown'`, the page shows "Finding you…".
- I assumed `navigator.clipboard` is usable in the website and Mac builds as a fallback for sharing.
- I assumed `haptics.tap('light')` needs no guard, as the sheet says.
- I assumed `modifierKey` is a plain constant that can be compared directly.

## Website
1. Camera: no preview or "Take photo" button. The visitor sees a note that the camera is available in the iPhone and Android apps.
2. Location: no location. The visitor sees a note that location is available in the apps.
3. Like: the button counts presses as normal. The haptic tap does nothing.
4. Offline banner: never shown, because the network feature does not exist in the website build.
5. Share: a "Copy link" button replaces the share sheet and copies the page url to the clipboard.
6. Hint: "Press ⌘K to search" on an Apple system, "Press Ctrl+K to search" otherwise, based on the visitor's system.

Tools used: Read (once, to read the instructions file)
