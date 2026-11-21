```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, haptics, network, platform, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failed = state('');

	const take = async () => {
		if (!camera.supported) return;
		try {
			failed = '';
			photo = await cam.takePhoto();
		} catch (error) {
			failed = error instanceof Error ? error.message : 'Could not take a photo';
		}
	};

	<section>
		@if (camera.supported) {
			<>
				@if (cam.access === 'denied') {
					<p>Camera access was refused. Allow it in Settings to take photos.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button onClick={take} disabled={!cam.ready}>Take photo</button>
					</>
				}
				@if (failed !== '') {
					<p>{failed}</p>
				}
				@if (photo !== null) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
			</>
		} @else {
			<p>Taking photos is available in the iPhone and Android apps.</p>
		}
	</section>
}

function LocationPanel() @{
	const loc = geolocation();

	<section>
		@if (geolocation.supported) {
			<>
				@if (loc.access === 'denied') {
					<p>Location access was refused, so we can't show where you are.</p>
				} @else {
					<>
						@if (loc.position === null) {
							<p>Finding you…</p>
						} @else {
							<p>
								You are at {loc.position.latitude.toFixed(5)}, {loc.position.longitude.toFixed(5)} (within{' '}
								{Math.round(loc.position.accuracy)} m)
							</p>
						}
					</>
				}
			</>
		} @else {
			<p>Your location is available in the iPhone and Android apps.</p>
		}
	</section>
}

function OfflineBanner() @{
	const net = network();

	<>
		@if (network.supported && !net.online) {
			<div role="status">You are offline</div>
		}
	</>
}

function LikeButton() @{
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			haptics.tap('light');
		}}
	>
		Like ({likes})
	</button>
}

function ShareButton({ title, url }: { title: string; url: string }) @{
	let note = state('');

	const share = async () => {
		note = '';
		if (sharesheet.supported) {
			await sharesheet.open({ title, url });
			return;
		}
		try {
			if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
				await navigator.share({ title, url });
			} else {
				await navigator.clipboard.writeText(url);
				note = 'Link copied';
			}
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) note = 'Could not share this page';
		}
	};

	<span>
		<button onClick={share}>Share</button>
		@if (note !== '') {
			<span>{note}</span>
		}
	</span>
}

function SearchHint() @{
	const onMac =
		platform.macos ||
		(platform.web && typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac'));

	<p>{onMac ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	<main>
		<OfflineBanner />
		<h1>{title}</h1>
		<SearchHint />
		<CameraPanel />
		<LocationPanel />
		<div>
			<LikeButton />
			<ShareButton title={title} url={url} />
		</div>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `@if` blocks can be nested and can sit inside a fragment `<>…</>`, and that a reading such as `cam.access` inside an `@if (camera.supported)` arm counts as guarded.
- I assumed the early `if (!camera.supported) return;` before the `try` still counts as a guard for `await cam.takePhoto()`.
- I assumed `takePhoto()` can throw, and caught it with an ordinary try/catch in the handler instead of using `@try`.
- I assumed a fragment can be the one root of a component body (`OfflineBanner`).
- I assumed handlers can be `async` and that `navigator` is available to the website build in the browser. I also assumed the website build reads `navigator` once in the component body. If the page is rendered on the server first, a Mac visitor may briefly see the Ctrl+K hint, or the page may not match what the server sent.
- I assumed `platform.web` stays true on the website even for iPad visitors, where `navigator.platform` reports "MacIntel".
- The Mac app has no device features, so it gets the same fallbacks as the website.

## Website
1. Camera: no camera preview. Visitors see the message "Taking photos is available in the iPhone and Android apps."
2. Location: visitors see "Your location is available in the iPhone and Android apps." There is no "Finding you…" state and no refusal message.
3. Like: the button counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because the `network` feature does not exist in the website build.
5. Share: uses the browser's own share panel if it has one. Otherwise it copies the url and shows "Link copied".
6. Hint: "Press ⌘K to search" if the browser reports a Mac, otherwise "Press Ctrl+K to search".

Tools used: Read (once, to open the instructions file; no tools were used to write the answer)
