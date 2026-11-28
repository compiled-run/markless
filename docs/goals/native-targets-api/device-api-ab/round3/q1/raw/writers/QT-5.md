```tsrx
// file: CameraPanel.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section class="camera">
		@if (camera.supported) {
			<>
				@if (cam.access === 'denied') {
					<p>Camera access was refused. Turn it on in Settings to take photos.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button
							disabled={!cam.ready}
							onClick={async () => {
								if (!camera.supported) return;
								photo = await cam.takePhoto();
							}}
						>
							Take photo
						</button>
					</>
				}
				@if (photo !== null) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</>
		} @else {
			<p>Open this page in the iPhone or Android app to take photos.</p>
		}
	</section>
}
```

```tsrx
// file: Location.tsrx
import { geolocation } from '@markless/device';

export default function Location() @{
	const geo = geolocation();

	<p class="location">
		@if (geolocation.supported) {
			@if (geo.access === 'denied') {
				<span>Location access was refused, so we can't show where you are.</span>
			} @else {
				@if (geo.position !== null) {
					<span>
						You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
					</span>
				} @else {
					<span>Finding you…</span>
				}
			}
		} @else {
			<span>Your location is shown in the iPhone and Android apps.</span>
		}
	</p>
}
```

```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, modifierKey, network, sharesheet } from '@markless/device';
import CameraPanel from './CameraPanel.tsrx';
import Location from './Location.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	const net = network();
	let likes = state(0);

	<main>
		@if (network.supported && !net.online) {
			<div class="banner" role="status">You are offline</div>
		}

		<h1>{title}</h1>

		<p class="hint">Press {modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search</p>

		<CameraPanel />

		<Location />

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
			<a href={url}>Link to this page: {title}</a>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I guessed that a guard must sit in the same component as the feature use. So each component guards itself rather than relying on a guard in its parent.
- I guessed that `@if (camera.supported)` also counts as a guard for the camera element and for `cam.ready` / `cam.access` inside the nested `@if`/`@else` blocks and fragments.
- I guessed that TypeScript narrows `photo !== null` and `geo.position !== null` inside the `@if` blocks.
- I guessed that an async handler that does `photo = await …` updates the state normally.
- I guessed that an `@if` with no `@else` (the offline banner, the last photo) is allowed.
- I guessed that a ternary on `modifierKey` inside `{}` is fine, since it is not a device feature.
- The sheet says nothing about camera or share failures (for example, the person cancels), so I did not handle errors in those handlers.
- I assumed the Mac app has no device features either, so it gets the same fallbacks as the website.

## Website
1. Camera: no preview and no button. Instead a note says to open the page in the iPhone or Android app to take photos.
2. Location: no lookup happens. A note says your location is shown in the iPhone and Android apps.
3. Like: the button works and counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because there is no network feature in that build.
5. Share: instead of a Share button, a link to the page's url, labelled with its title.
6. Hint: "Press ⌘K to search" on a Mac visitor's system, and "Press Ctrl+K to search" for everyone else.

Tools used: Read (once, to read the instructions file)
