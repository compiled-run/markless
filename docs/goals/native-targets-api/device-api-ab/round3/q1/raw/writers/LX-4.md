```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, sharesheet, modifierKey } from '@markless/device';
import { CameraPanel } from './CameraPanel.tsrx';
import { LocationText } from './LocationText.tsrx';
import { OfflineBanner } from './OfflineBanner.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let shareNote = state('');

	const like = () => {
		likes++;
		try {
			haptics.tap('light');
		} catch {
			// No haptics outside the phone builds; the like still counts.
		}
	};

	const share = async () => {
		shareNote = '';
		try {
			await sharesheet.open({ title, text: title, url });
		} catch (error) {
			if ((error as Error).name !== 'NotSupportedError') return;
			try {
				if (typeof navigator !== 'undefined' && navigator.share) {
					await navigator.share({ title, url });
				} else {
					await navigator.clipboard.writeText(url);
					shareNote = 'Link copied';
				}
			} catch {
				shareNote = 'Could not share this page';
			}
		}
	};

	<main>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<></>
		}

		<h1>{title}</h1>

		<p>{modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>

		<section>
			@try {
				<CameraPanel />
			} @catch (error) {
				<p>The camera is available in the iPhone and Android apps.</p>
			}
		</section>

		<section>
			@try {
				<LocationText />
			} @catch (error) {
				<p>Your location is available in the iPhone and Android apps.</p>
			}
		</section>

		<section>
			<button onClick={like}>Like ({likes})</button>
			<button onClick={share}>Share</button>
			<span>{shareNote}</span>
		</section>
	</main>
}
```

```tsx
// file: CameraPanel.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base } from '@markless/ui';

export function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state('');

	const take = async () => {
		failure = '';
		try {
			photo = await cam.takePhoto();
		} catch (error) {
			failure = (error as Error).message;
		}
	};

	<div>
		@if (cam.access === 'denied') {
			<p>Camera access was refused. Allow it in Settings to take photos.</p>
		} @else {
			<div>
				<base.camera el={cam} />
				<button onClick={take} disabled={!cam.ready}>Take photo</button>
				<span>{failure}</span>
				@if (photo) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</div>
		}
	</div>
}
```

```tsx
// file: LocationText.tsrx
import { computed } from '@markless/core';
import { geolocation } from '@markless/device';

export function LocationText() @{
	const geo = geolocation();
	const text = computed(() => {
		const p = geo.position;
		return p
			? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (within ${Math.round(p.accuracy)} m)`
			: '';
	});

	<div>
		@if (geo.access === 'denied') {
			<p>Location access was refused, so we can't show where you are.</p>
		} @else {
			<div>
				@if (geo.position === null) {
					<p>Finding you…</p>
				} @else {
					<p>You are at {text}</p>
				}
			</div>
		}
	</div>
}
```

```tsx
// file: OfflineBanner.tsrx
import { network } from '@markless/device';

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
- I assumed `@else` exists as a plain block. I nested `@if` inside `@else` instead of writing `@else @if`, since the guidance doesn't say whether chaining is allowed.
- I assumed `@catch (error) { <></> }` (an empty fragment) is a valid way to render nothing, and that a `@try` with only `@catch` and no `@pending` is fine for synchronous throws.
- I assumed the throw from `camera()`, `geolocation()` or `network()` in a child component's body is caught by the parent's `@try` around that child.
- I assumed `@if (photo)` narrows `photo` so `photo.url` type-checks. I also assumed `disabled={!cam.ready}` is reasonable even though `takePhoto` waits until the camera is ready anyway.
- I assumed a rejected `takePhoto()` or `sharesheet.open()` can be caught with try/catch in a handler, and that the rejection's `error.name` is `'NotSupportedError'`.
- I assumed the camera's access state goes through `'unknown'` while the preview is shown, so the permission prompt can appear.
- The website share fallback (Web Share API, then copying the link to the clipboard) is my own choice.
- I assumed `modifierKey` is a plain constant I can read at render time.

## Website
1. Camera: no preview or button. The visitor sees "The camera is available in the iPhone and Android apps."
2. Location: the visitor sees "Your location is available in the iPhone and Android apps."
3. Like: the count works. There's no haptic tap because the error is caught and ignored.
4. Offline banner: nothing is shown, because `network()` throws and the `@catch` renders an empty fragment.
5. Share: the browser's own share panel if it has one, otherwise the URL is copied to the clipboard and "Link copied" is shown.
6. Search hint: "Press ⌘K to search" on a Mac and "Press Ctrl+K to search" on other systems, based on the visitor's system.

Tools used: Read (once, to read the instructions file)
