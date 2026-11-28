```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state<string | null>(null);

	<section>
		@if (camera.supported) {
			<div>
				@if (cam.access === 'denied') {
					<p>Camera access was refused. Allow it in Settings to take photos.</p>
				} @else {
					<div>
						<base.camera el={cam} />
						<button
							disabled={!cam.ready}
							onClick={async () => {
								if (!camera.supported) return;
								try {
									failure = null;
									photo = await cam.takePhoto();
								} catch (error) {
									failure = (error as Error).message;
								}
							}}
						>
							Take photo
						</button>
						@if (failure !== null) {
							<p>{failure}</p>
						}
						@if (photo !== null) {
							<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
						}
					</div>
				}
			</div>
		} @else {
			<p>The camera is available in the iPhone and Android apps.</p>
		}
	</section>
}

function LocationPanel() @{
	const geo = geolocation();

	<section>
		@if (geolocation.supported) {
			<div>
				@if (geo.access === 'denied') {
					<p>Location access was refused, so we can't show where you are.</p>
				} @else {
					<div>
						@if (geo.position === null) {
							<p>Finding you…</p>
						} @else {
							<p>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
							</p>
						}
					</div>
				}
			</div>
		} @else {
			<p>Your location is available in the iPhone and Android apps.</p>
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
					await navigator.clipboard.writeText(url);
					copied = true;
				}}
			>
				{copied ? 'Link copied' : 'Copy link'}
			</button>
		}
	</div>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	<main>
		<OfflineBanner />
		<h1>{title}</h1>
		<p>{platform.macos ? 'Press ⌘K to search' : 'Press Ctrl+K to search'}</p>
		<CameraPanel />
		<LocationPanel />
		<LikeButton />
		<ShareButton title={title} url={url} />
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed a component body can make a feature object without a guard (`camera()`, `geolocation()`, `network()`), and that the builds without the feature simply never use it.
- I assumed a nested `@if` (or `@else`) inside a guarded `@if` still counts as guarded, and that `disabled={!cam.ready}` inside the guarded branch is allowed.
- I assumed TypeScript narrowing works on state in `@if (photo !== null)` and `@if (geo.position === null) … @else`.
- I assumed a `try`/`catch` inside an async handler is fine for `takePhoto` failures.
- I assumed `navigator.clipboard` is fine in the Mac app and website builds as the share fallback, since the sheet does not cover web sharing.
- I assumed `platform.macos` is the right test for "a person on a Mac". The sheet says the website build cannot tell which system the visitor uses, so website visitors on a Mac see the Ctrl+K text.
- I assumed `{a ? b : c}` text expressions and a `(error as Error)` cast are allowed in `.tsrx`.

## Website
1. Camera: a note saying "The camera is available in the iPhone and Android apps." There is no preview and no button.
2. Location: a note saying "Your location is available in the iPhone and Android apps."
3. Like: the button works and counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because the connection feature does not exist on the website.
5. Share: a "Copy link" button that copies the url and then says "Link copied".
6. Hint: always "Press Ctrl+K to search", including for visitors on a Mac.

Tools used: Read (once, to read the instructions file)
