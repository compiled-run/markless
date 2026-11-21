```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { modifierKey, sharesheet } from '@markless/device';
import { CameraPanel, LocationText, LikeButton, OfflineBanner } from './DeviceParts.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	let shareNote = state('');
	const hint = modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	async function share() {
		shareNote = '';
		try {
			await sharesheet.open({ title, url });
		} catch (error) {
			if ((error as Error).name !== 'NotSupportedError') {
				shareNote = 'Could not open sharing.';
				return;
			}
			try {
				if (typeof navigator.share === 'function') {
					await navigator.share({ title, url });
				} else {
					await navigator.clipboard.writeText(url);
					shareNote = 'Link copied.';
				}
			} catch {
				shareNote = 'Could not share this page.';
			}
		}
	}

	<main>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<></>
		}

		<h1>{title}</h1>
		<p>{hint}</p>

		@try {
			<CameraPanel />
		} @catch (error) {
			<p>The camera is available in the iPhone and Android apps.</p>
		}

		@try {
			<LocationText />
		} @catch (error) {
			<p>Your location is available in the iPhone and Android apps.</p>
		}

		<LikeButton />

		<div>
			<button onClick={share}>Share</button>
			<span>{shareNote}</span>
		</div>
	</main>
}
```

```tsrx
// file: DeviceParts.tsrx
import { computed, state } from '@markless/core';
import { camera, geolocation, haptics, network } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failed = state('');

	async function take() {
		failed = '';
		try {
			photo = await cam.takePhoto();
		} catch (error) {
			failed = (error as Error).message;
		}
	}

	<section>
		@if (cam.access === 'denied') {
			<p>Camera access was refused.</p>
		} @else {
			<>
				<base.camera el={cam} />
				<button onClick={take}>Take photo</button>
				<span>{failed}</span>
			</>
		}
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</section>
}

export function LocationText() @{
	const geo = geolocation();
	const text = computed(() => {
		if (geo.access === 'denied') return 'Location access was refused.';
		const p = geo.position;
		if (!p) return 'Finding you…';
		return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (±${Math.round(p.accuracy)} m)`;
	});

	<p>{text}</p>
}

export function LikeButton() @{
	let likes = state(0);

	function like() {
		likes++;
		try {
			haptics.tap('light');
		} catch {
			// No haptics outside the phone builds.
		}
	}

	<button onClick={like}>Like ({likes})</button>
}

export function OfflineBanner() @{
	const net = network();

	<div>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
	</div>
}
```

Confidence: 3/5

## Guesses
- I assumed the `@if (...) { } @else { }` syntax and that `@if (photo)` narrows `photo` so I can read `photo.url` inside it.
- I assumed `@catch` without `@pending` is fine for synchronous throws, and that an empty `<>`/`</>` counts as the one allowed node.
- In the camera and location `@catch` blocks I show a fixed "available in the apps" message. I did not branch on `error.name`, so any other error there gets the same message.
- I assumed a component can be imported from another `.tsrx` file as a named export, and that `<base.camera el={cam} />` works inside a child component that made the camera.
- I assumed a live field such as `cam.access` or `geo.position` can be read inside `computed` and `@if`, and that the page updates when it changes.
- I assumed `title`/`url` props can be read inside an async handler, and that `navigator` exists when that handler runs in a browser.
- The website share fallback is my choice: use the browser's share panel, or copy the link if there is none.

## Website
1. Camera: no preview and no button. The visitor sees "The camera is available in the iPhone and Android apps."
2. Location: the visitor sees "Your location is available in the iPhone and Android apps."
3. Like: the button counts presses but there is no haptic tap.
4. Offline banner: never shown, because the website build has no connection feature.
5. Share: opens the browser's share panel if it has one. Otherwise it copies the URL and shows "Link copied."
6. Hint: shows "Press ⌘K to search" on Apple systems and "Press Ctrl+K to search" everywhere else, based on the visitor's system.

Tools used: Read (once, to read the instructions file)
