```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, modifierKey, sharesheet } from '@markless/device';
import { CameraPanel } from './CameraPanel.tsrx';
import { LocationPanel } from './LocationPanel.tsrx';
import { OfflineBanner } from './OfflineBanner.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let shareNote = state('');

	const like = () => {
		likes++;
		try {
			haptics.tap('light');
		} catch {
			// No haptics outside the phone builds; the press still counts.
		}
	};

	const share = async () => {
		shareNote = '';
		try {
			await sharesheet.open({ title, url });
		} catch {
			try {
				await navigator.clipboard.writeText(url);
				shareNote = 'Link copied';
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
		<p>{'Press ' + (modifierKey === '⌘' ? '⌘K' : 'Ctrl+K') + ' to search'}</p>

		@try {
			<CameraPanel />
		} @catch (error) {
			<p>The camera is only available in the iPhone and Android apps.</p>
		}

		@try {
			<LocationPanel />
		} @catch (error) {
			<p>Your location is only available in the iPhone and Android apps.</p>
		}

		<button onClick={like}>{'Like (' + likes + ')'}</button>

		<div>
			<button onClick={share}>Share</button>
			@if (shareNote !== '') {
				<span>{shareNote}</span>
			}
		</div>
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
			failure = 'Could not take a photo';
		}
	};

	<section>
		@if (cam.access === 'denied') {
			<p>Camera access was refused.</p>
		} @else {
			<div>
				<base.camera el={cam} />
				<button onClick={take} disabled={!cam.ready}>Take photo</button>
				@if (failure !== '') {
					<p>{failure}</p>
				}
				@if (photo !== null) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</div>
		}
	</section>
}
```

```tsx
// file: LocationPanel.tsrx
import { geolocation } from '@markless/device';

export function LocationPanel() @{
	const geo = geolocation();

	<section>
		@if (geo.access === 'denied') {
			<p>Location access was refused, so we can't show where you are.</p>
		} @else {
			<>
				@if (geo.position === null) {
					<p>Finding you…</p>
				} @else {
					<p>
						{'You are at ' +
							geo.position.latitude.toFixed(5) + ', ' +
							geo.position.longitude.toFixed(5) +
							' (±' + Math.round(geo.position.accuracy) + ' m)'}
					</p>
				}
			</>
		}
	</section>
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
- I assumed `camera()`, `geolocation()` and `network()` throwing in a child component's body is caught by the parent's `@try`/`@catch`, as the sheet says, and that the rest of the page still renders.
- I assumed a `@catch` with no `@pending` may render an empty fragment `<></>`.
- I assumed `haptics.tap()` throws synchronously, so a plain `try/catch` in the handler catches it, and that a rejected `sharesheet.open()` can be caught with `await` inside `try`.
- I assumed it is fine to nest an `@if`/`@else` inside a fragment within `@else`, and that `disabled={!cam.ready}` is a valid attribute binding.
- I assumed `navigator.clipboard` can be used in a website handler as the share fallback.
- I assumed `@if` without `@else` is allowed, and that importing `.tsrx` components by relative path works.
- I assumed a narrowed `geo.position` and `photo` read inside their `@if` branch type-check as non-null.

## Website
1. Camera: the message "The camera is only available in the iPhone and Android apps." There is no preview and no button.
2. Location: the message "Your location is only available in the iPhone and Android apps."
3. Like: the button counts presses as normal, with no haptic tap.
4. Offline banner: never shown, because the website has no network feature.
5. Share: the share panel open fails, so the page URL is copied to the clipboard and "Link copied" appears. If the copy also fails, it shows "Could not share this page".
6. Hint: "Press ⌘K to search" on an Apple system and "Press Ctrl+K to search" otherwise, based on the visitor's system.

Tools used: Read (once, to read the instructions file)
