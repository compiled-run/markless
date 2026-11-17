```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state('');

	<section>
		<base.camera el={cam} />
		<button
			disabled={!cam.ready}
			onClick={async () => {
				try {
					photo = await cam.takePhoto();
					failure = '';
				} catch (error) {
					failure = 'Could not take a photo.';
				}
			}}
		>
			Take photo
		</button>
		@if (cam.access === 'denied') {
			<p>Camera access was refused.</p>
		}
		@if (failure !== '') {
			<p>{failure}</p>
		}
		@if (photo !== null) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</section>
}

function LocationPanel() @{
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
						You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
					</p>
				}
			</>
		}
	</section>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	const net = network();
	let likes = state(0);

	<main>
		@if ((platform.ios || platform.android) && !net.online) {
			<div role="status">You are offline</div>
		}

		<h1>{title}</h1>

		@if (platform.ios || platform.android) {
			<CameraPanel />
		} @else {
			<p>The camera is available in the iPhone and Android apps.</p>
		}

		@if (platform.ios || platform.android) {
			<LocationPanel />
		} @else {
			<p>Your location is available in the iPhone and Android apps.</p>
		}

		<button
			onClick={() => {
				likes++;
				haptics.tap('light');
			}}
		>
			Like ({likes})
		</button>

		@if (platform.ios || platform.android) {
			<button
				onClick={async () => {
					await sharesheet.open({ title, text: title, url });
				}}
			>
				Share
			</button>
		} @else {
			<p>
				Share this page: <a href={url}>{url}</a>
			</p>
		}

		@if (platform.macos) {
			<p>Press ⌘K to search</p>
		} @else {
			@if (platform.web) {
				<p>Press ⌘K (Mac) or Ctrl+K to search</p>
			} @else {
				<p>Press Ctrl+K to search</p>
			}
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed code inside a guarded `@if` arm counts as guarded, including child components (`CameraPanel`, `LocationPanel`) and their handlers. So I did not repeat the guard inside each one.
- I assumed `cam.ready` and `cam.access` can be read freely inside `CameraPanel`, because that component only renders within a guard.
- I assumed `<base.camera el={cam} />` works when `cam` is made in the same component that shows it (`CameraPanel`).
- I assumed `network()` can be created at the top of `Post`, as long as `net.online` is only read inside the guard expression `(platform.ios || platform.android) && !net.online`.
- I assumed a nested `@if` inside `@else` is allowed when wrapped in `<>…</>` or used as the single node.
- I assumed `takePhoto()` can reject (for example when camera access is denied), so I catch that and show a message.
- I assumed `haptics.tap` needs no guard, as the sheet says. On the Mac and website builds it does nothing.
- I left out browser APIs (`navigator.geolocation`, `navigator.share`, `navigator.onLine`) on the website, because the sheet says device features exist only in the iPhone and Android builds.
- The website build cannot tell whether a visitor is on a Mac, so it shows both shortcuts.

## Website
1. Camera: no camera preview. The visitor sees "The camera is available in the iPhone and Android apps."
2. Location: no location. The visitor sees "Your location is available in the iPhone and Android apps."
3. Like button: works and counts presses. There is no haptic tap.
4. Offline banner: never shown. The website build has no network feature.
5. Share: a visible link to the page's url to copy or share by hand, instead of the system share panel.
6. Search hint: "Press ⌘K (Mac) or Ctrl+K to search", because the website build cannot tell what system the visitor uses.

Tools used: none
