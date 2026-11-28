```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let error = state('');

	<section>
		@if (camera.supported) {
			<>
				@if (cam.access === 'denied') {
					<p>Camera access was refused.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button
							disabled={!cam.ready}
							onClick={async () => {
								if (!camera.supported) return;
								try {
									photo = await cam.takePhoto();
									error = '';
								} catch (e) {
									error = (e as Error).message;
								}
							}}
						>
							Take photo
						</button>
						@if (error !== '') {
							<p>{error}</p>
						}
						@if (photo !== null) {
							<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
						}
					</>
				}
			</>
		} @else {
			<p>The camera is available in the iPhone and Android apps.</p>
		}
	</section>
}

function LocationPanel() @{
	const geo = geolocation();

	<section>
		@if (geolocation.supported) {
			<>
				@if (geo.access === 'denied') {
					<p>Location access was refused, so we can't show where you are.</p>
				} @else {
					<>
						@if (geo.position === null) {
							<p>Finding you…</p>
						} @else {
							<p>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within{' '}
								{Math.round(geo.position.accuracy)} m)
							</p>
						}
					</>
				}
			</>
		} @else {
			<p>Your location is shown in the iPhone and Android apps.</p>
		}
	</section>
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

function OfflineBanner() @{
	const net = network();

	<div>
		@if (network.supported && !net.online) {
			<p role="status">You are offline</p>
		}
	</div>
}

function ShareButton({ title, url }: { title: string; url: string }) @{
	let copied = state(false);

	<div>
		@if (sharesheet.supported) {
			<button
				onClick={async () => {
					if (!sharesheet.supported) return;
					await sharesheet.open({ title, text: title, url });
				}}
			>
				Share
			</button>
		} @else {
			<button
				onClick={async () => {
					if (typeof navigator !== 'undefined' && navigator.share) {
						try {
							await navigator.share({ title, url });
							return;
						} catch {
							// fall through to copy
						}
					}
					await navigator.clipboard.writeText(url);
					copied = true;
				}}
			>
				{copied ? 'Link copied' : 'Share'}
			</button>
		}
	</div>
}

function SearchHint() @{
	const onMac =
		platform.macos ||
		(platform.web && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent));

	<p>{onMac ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	<main>
		<OfflineBanner />
		<h1>{title}</h1>
		<SearchHint />
		<CameraPanel />
		<LocationPanel />
		<LikeButton />
		<ShareButton title={title} url={url} />
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed that making a feature object (`camera()`, `geolocation()`, `network()`) in a component body is safe in every build, since the sheet says it "may stand anywhere". I also assumed field reads inside the `@if (x.supported)` arm count as guarded, including nested `@if`s and handlers inside that arm. I added an early-return guard in each handler as well, to be safe.
- I assumed a `@else` arm attached to an `@if` that holds a `<>…</>` fragment works, and that `@if` can hold a fragment of `@if`s.
- I assumed `takePhoto()` rejects if access is denied, so I catch the error and show its message. I also disable the button until `cam.ready` is true.
- I assumed I can use the browser's own APIs (`navigator.share`, `navigator.clipboard`) in the non-device builds as the share fallback.
- For the hint, the sheet says `platform.web` is true for every website visitor, whatever system they use. To still show ⌘K to Mac visitors, I check `navigator.platform` (or the user agent) in the browser. I assumed the body runs where `navigator` exists, or that a server-rendered "Ctrl+K" being corrected on the client is acceptable.
- I assumed the Mac app's `platform.macos` is the right "person on a Mac" test there.
- I assumed `network.supported && !net.online` counts as a guard because it starts with `feature.supported &&`. On the website and Mac, the banner is simply never shown.

## Website
1. Camera: a note that the camera is available in the iPhone and Android apps. No preview and no button.
2. Location: a note that location is shown in the iPhone and Android apps. No "Finding you…" state and no refusal message.
3. Like: the button counts presses. The haptic tap does nothing.
4. Offline banner: never shown.
5. Share: the button uses the browser's share panel if there is one. Otherwise it copies the URL and the label changes to "Link copied".
6. Hint: "Press ⌘K to search" if the visitor's browser reports a Mac, otherwise "Press Ctrl+K to search".

Tools used: Read (once, to read the instructions file)
