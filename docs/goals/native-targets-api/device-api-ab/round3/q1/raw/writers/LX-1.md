```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { CameraPanel } from './CameraPanel.tsrx';
import { LocationPanel } from './LocationPanel.tsrx';
import { LikeButton } from './LikeButton.tsrx';
import { OfflineBanner } from './OfflineBanner.tsrx';
import { ShareButton } from './ShareButton.tsrx';
import { SearchHint } from './SearchHint.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	<main>
		<h1>{title}</h1>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<span hidden></span>
		}
		@try {
			<CameraPanel />
		} @catch (error) {
			<p>The camera is available in the iPhone and Android apps.</p>
		}
		@try {
			<LocationPanel />
		} @catch (error) {
			<p>Your location is available in the iPhone and Android apps.</p>
		}
		<LikeButton />
		<ShareButton title={title} url={url} />
		<SearchHint />
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
	let failed = state('');

	<section>
		@if (cam.access === 'denied') {
			<p>Camera access was refused. Allow it in Settings to take photos.</p>
		} @else {
			<div>
				<base.camera el={cam} />
				<button
					disabled={!cam.ready}
					onClick={async () => {
						failed = '';
						try {
							photo = await cam.takePhoto();
						} catch (e) {
							failed = (e as Error).message;
						}
					}}
				>
					Take photo
				</button>
				@if (failed !== '') {
					<p>{failed}</p>
				}
			</div>
		}
		@if (photo !== null) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
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
			<div>
				@if (geo.position === null) {
					<p>Finding you…</p>
				} @else {
					<p>
						You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within{' '}
						{Math.round(geo.position.accuracy)} m)
					</p>
				}
			</div>
		}
	</section>
}
```

```tsx
// file: LikeButton.tsrx
import { state } from '@markless/core';
import { haptics } from '@markless/device';

export function LikeButton() @{
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			try {
				haptics.tap('light');
			} catch {
				// No haptics outside the phone builds; the like still counts.
			}
		}}
	>
		Like ({likes})
	</button>
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

```tsx
// file: ShareButton.tsrx
import { state } from '@markless/core';
import { sharesheet } from '@markless/device';

export function ShareButton({ title, url }: { title: string; url: string }) @{
	let note = state('');

	<div>
		<button
			onClick={async () => {
				note = '';
				try {
					await sharesheet.open({ title, url });
				} catch (e) {
					if ((e as Error).name !== 'NotSupportedError') {
						note = (e as Error).message;
						return;
					}
					try {
						await navigator.clipboard.writeText(url);
						note = 'Link copied';
					} catch {
						note = `Copy this link: ${url}`;
					}
				}
			}}
		>
			Share
		</button>
		@if (note !== '') {
			<span>{note}</span>
		}
	</div>
}
```

```tsx
// file: SearchHint.tsrx
import { modifierKey } from '@markless/device';

export function SearchHint() @{
	<p>{modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
}
```

Confidence: 3/5

## Guesses
- I assumed a `NotSupportedError` thrown while a child component's body runs is caught by the parent's `@try`/`@catch`, and that `@try` with only `@catch` is allowed.
- I used `<span hidden></span>` as the "show nothing" node in a `@catch`, because I wasn't sure an empty `<></>` counts as one node.
- I assumed `@if` can be used without `@else`, and that `@else` comes straight after the `@if` block.
- I assumed async handlers and plain `try/catch` inside handlers are fine, and that a handler can read the error from a rejected promise in its own `try/catch`. The guidance only restricts reading `error` in `@catch` handlers.
- I assumed `cam.access` and `geo.access` are live fields in the body markup, and that `geo.position` narrows correctly inside `@else`.
- I assumed `.tsrx` files can import named components from other `.tsrx` files and that a `type` import of `Photo` works.
- Keeping the "Take photo" button disabled until `cam.ready` is my own choice. `takePhoto` already waits until the camera is ready.
- I assumed `navigator.clipboard` is available in the website build.

## Website
1. Camera: no preview and no button. The visitor sees "The camera is available in the iPhone and Android apps."
2. Location: the visitor sees "Your location is available in the iPhone and Android apps."
3. Like: the button counts presses as normal, with no haptic tap.
4. Offline banner: nothing is shown, because there is no connection monitor on the website.
5. Share: the url is copied to the clipboard and "Link copied" appears. If copying fails, the link is shown as text to copy.
6. Search hint: "Press ⌘K to search" on a Mac and "Press Ctrl+K to search" on any other system, based on the visitor's own system.

Tools used: Read (once, to read the instruction file)
