```tsrx
// file: CameraPanel.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failed = state('');

	<section>
		@if (camera.supported) {
			<>
				@if (camera.supported && cam.access === 'denied') {
					<p>Camera access was refused. Allow it in Settings to take photos.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button
							disabled={!cam.ready}
							onClick={async () => {
								if (!camera.supported) return;
								try {
									photo = await cam.takePhoto();
									failed = '';
								} catch (error) {
									failed = 'Could not take a photo.';
								}
							}}
						>
							Take photo
						</button>
						<p>{failed}</p>
						@if (photo) {
							<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
						}
					</>
				}
			</>
		} @else {
			<p>Taking photos is available in the iPhone and Android apps.</p>
		}
	</section>
}
```

```tsrx
// file: LocationPanel.tsrx
import { geolocation } from '@markless/device';

export default function LocationPanel() @{
	const geo = geolocation();

	<section>
		@if (geolocation.supported) {
			<>
				@if (geolocation.supported && geo.access === 'denied') {
					<p>Location access was refused, so we can't show where you are.</p>
				} @else {
					<p>
						{geo.position
							? `You are at ${geo.position.latitude.toFixed(5)}, ${geo.position.longitude.toFixed(5)} (within ${Math.round(geo.position.accuracy)} m)`
							: 'Finding you…'}
					</p>
				}
			</>
		} @else {
			<p>Your location is shown in the iPhone and Android apps.</p>
		}
	</section>
}
```

```tsrx
// file: OfflineBanner.tsrx
import { network } from '@markless/device';

export default function OfflineBanner() @{
	const net = network();

	<div>
		@if (network.supported && !net.online) {
			<p role="status">You are offline</p>
		}
	</div>
}
```

```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, platform, sharesheet } from '@markless/device';
import CameraPanel from './CameraPanel.tsrx';
import LocationPanel from './LocationPanel.tsrx';
import OfflineBanner from './OfflineBanner.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let copied = state(false);

	<main>
		<OfflineBanner />
		<h1>{title}</h1>

		<CameraPanel />
		<LocationPanel />

		<button
			onClick={() => {
				likes++;
				haptics.tap('light');
			}}
		>
			Like ({likes})
		</button>

		@if (sharesheet.supported) {
			<button
				onClick={async () => {
					if (!sharesheet.supported) return;
					await sharesheet.open({ title, url });
				}}
			>
				Share
			</button>
		} @else {
			<button
				onClick={async () => {
					await navigator.clipboard.writeText(url);
					copied = true;
				}}
			>
				{copied ? 'Link copied' : 'Copy link'}
			</button>
		}

		@if (platform.macos) {
			<p>Press ⌘K to search</p>
		} @else {
			<>
				@if (platform.web) {
					<p>Press ⌘K (on a Mac) or Ctrl+K to search</p>
				} @else {
					<p>Press Ctrl+K to search</p>
				}
			</>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed code inside a guarded `@if` counts as guarded, including nested `@if`s and handlers. I still added the explicit `supported` checks inside them in case it does not.
- I assumed a nested `@if` / `@else` must be wrapped in `<>…</>` to count as one node. I also assumed an `@if` without an `@else` is allowed.
- I assumed the camera and location objects can be made in the component body without a guard, because the sheet says making one "may stand anywhere". I also assumed that each object belongs to the component that shows it, which is why each one is made inside its own panel component.
- I assumed `takePhoto()` can reject (for example, when access is denied while waiting), so I catch that and show a message.
- I assumed that in the Mac build and on the website the `@else` arms are allowed to use plain browser APIs such as `navigator.clipboard`. I also assumed attributes like `disabled={...}` and template strings inside `{}` work as normal.
- I assumed that once access is denied, `position` stays null. That is why the "access refused" message is checked before "Finding you…".
- The website build cannot tell whether a visitor is on a Mac (`platform.web` is true for everyone), so the website shows both keyboard shortcuts.

## Website
1. Camera: no preview and no button. The visitor sees "Taking photos is available in the iPhone and Android apps."
2. Location: no location. The visitor sees "Your location is shown in the iPhone and Android apps."
3. Like button: works and counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because the network feature does not exist on the website.
5. Share: instead of the system share panel, a "Copy link" button copies the url and then shows "Link copied".
6. Hint: "Press ⌘K (on a Mac) or Ctrl+K to search", because the website build cannot tell whether the visitor uses a Mac.

Tools used: Read (once, to read the instructions file only)
