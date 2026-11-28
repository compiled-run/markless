```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, modifierKey, sharesheet } from '@markless/device';
import { CameraPanel, LocationText, OfflineBanner } from './DeviceParts.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let shareNote = state('');

	const like = () => {
		likes++;
		try {
			haptics.tap('light');
		} catch (error) {
			if (!(error instanceof Error && error.name === 'NotSupportedError')) throw error;
		}
	};

	const share = async () => {
		try {
			await sharesheet.open({ title, url });
			shareNote = '';
		} catch (error) {
			if (!(error instanceof Error && error.name === 'NotSupportedError')) {
				shareNote = 'Could not share.';
				return;
			}
			try {
				if (typeof navigator.share === 'function') {
					await navigator.share({ title, url });
					shareNote = '';
				} else {
					await navigator.clipboard.writeText(url);
					shareNote = 'Link copied.';
				}
			} catch {
				shareNote = 'Could not share.';
			}
		}
	};

	<main>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<>
				@if (error.name === 'NotSupportedError') {
					<></>
				} @else {
					<p>{error.message}</p>
				}
			</>
		}

		<h1>{title}</h1>
		<p>{modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>

		<section>
			@try {
				<CameraPanel />
			} @catch (error) {
				<>
					@if (error.name === 'NotSupportedError') {
						<p>The camera is available in the iPhone and Android apps.</p>
					} @else {
						<p>{error.message}</p>
					}
				</>
			}
		</section>

		<section>
			@try {
				<LocationText />
			} @catch (error) {
				<>
					@if (error.name === 'NotSupportedError') {
						<p>Your location is available in the iPhone and Android apps.</p>
					} @else {
						<p>{error.message}</p>
					}
				</>
			}
		</section>

		<div>
			<button onClick={like}>Like ({likes})</button>
			<button onClick={share}>Share</button>
			<span>{shareNote}</span>
		</div>
	</main>
}
```

```tsx
// file: DeviceParts.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, type Photo } from '@markless/device';
import { base } from '@markless/ui';

export function OfflineBanner() @{
	const net = network();
	<>
		@if (!net.online) {
			<div role="status">You are offline</div>
		}
	</>
}

export function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state('');

	const take = async () => {
		try {
			photo = await cam.takePhoto();
			failure = '';
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Could not take a photo.';
		}
	};

	<div>
		@if (cam.access === 'denied') {
			<p>Camera access was refused.</p>
		} @else {
			<div>
				<base.camera el={cam} />
				<button onClick={take} disabled={!cam.ready}>Take photo</button>
				<span>{failure}</span>
			</div>
		}
		@if (photo !== null) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</div>
}

export function LocationText() @{
	const geo = geolocation();
	<p>
		@if (geo.access === 'denied') {
			<span>Location access was refused.</span>
		} @else {
			<span>
				@if (geo.position === null) {
					<span>Finding you…</span>
				} @else {
					<span>
						You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±
						{Math.round(geo.position.accuracy)} m)
					</span>
				}
			</span>
		}
	</p>
}
```

Confidence: 3/5

## Guesses
- An empty fragment `<></>` counts as the one node a block may hold, and a body's single root may be a fragment.
- A `@try` with only `@catch` and no `@pending` is valid for synchronous throws that happen while a child component's body runs.
- `@if` and `@else` can sit inside `@catch` and branch on `error.name`.
- Something can sit on the same line between `@if`'s `}` and `@else`, and an `@if` with no `@else` is allowed.
- `disabled={!cam.ready}` stays live because it reads a live field.
- `takePhoto()` rejects, rather than hanging, when access is denied.
- `haptics.tap` throws synchronously in handlers, so a plain `try`/`catch` is enough.
- Importing between `.tsrx` files with named exports works.
- `navigator.share` and `navigator.clipboard` are fine to use as fallbacks on the website.

## Website
1. Camera: a note that says "The camera is available in the iPhone and Android apps." There is no preview and no button.
2. Location: a note that says "Your location is available in the iPhone and Android apps."
3. Like button: the count goes up on each press with no haptic tap and no error.
4. Offline banner: never shown, because the browser has no `network()` object.
5. Share button: opens the browser's own share panel if it has one, otherwise copies the url and shows "Link copied."
6. Search hint: shows "Press ⌘K to search" for visitors on Apple systems and "Press Ctrl+K to search" for everyone else, based on the visitor's system.

Tools used: Read (only to read the instructions file)
