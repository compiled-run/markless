```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, platform } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let photo = state<Photo | null>(null);
	let photoError = state('');
	let likes = state(0);
	let copied = state(false);

	const takePhoto = async () => {
		if (!camera.supported) return;
		try {
			photo = await cam.takePhoto();
			photoError = '';
		} catch (error) {
			photoError = (error as Error).message;
		}
	};

	const share = async () => {
		if (!sharesheet.supported) return;
		await sharesheet.open({ title, url });
	};

	const copyLink = async () => {
		await navigator.clipboard.writeText(url);
		copied = true;
	};

	const like = () => {
		likes++;
		haptics.tap('light');
	};

	<main>
		@if (network.supported && !net.online) {
			<p class="banner" role="status">You are offline</p>
		}

		<h1>{title}</h1>

		@if (camera.supported) {
			<section class="camera">
				@if (cam.access === 'denied') {
					<p>Camera access was refused. Allow it in Settings to take photos.</p>
				} @else {
					<div>
						<base.camera el={cam} />
						<button onClick={takePhoto} disabled={!cam.ready}>Take photo</button>
					</div>
				}
				@if (photo !== null) {
					<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
				}
				@if (photoError !== '') {
					<p>{photoError}</p>
				}
			</section>
		} @else {
			<p class="camera">Taking photos is available in the iPhone and Android apps.</p>
		}

		@if (geolocation.supported) {
			<p class="location">
				@if (geo.access === 'denied') {
					<span>Location access was refused, so we can't show where you are.</span>
				} @else {
					<span>
						@if (geo.position === null) {
							<span>Finding you…</span>
						} @else {
							<span>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
							</span>
						}
					</span>
				}
			</p>
		} @else {
			<p class="location">Your location is available in the iPhone and Android apps.</p>
		}

		<button onClick={like}>Like ({likes})</button>

		@if (sharesheet.supported) {
			<button onClick={share}>Share</button>
		} @else {
			<button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
		}

		<p class="hint">
			@if (platform.macos) {
				<span>Press ⌘K to search</span>
			} @else {
				<span>Press Ctrl+K to search</span>
			}
		</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed the feature objects can be created at the top of the body in every build (the sheet says creating one "may stand anywhere"). I also assumed that reading their fields inside an `@if (feature.supported)` block, or in a handler that starts with `if (!feature.supported) return;`, counts as a guard.
- I assumed the `like` handler, which isn't guarded, may call `haptics.tap('light')` directly, because the call returns nothing.
- I assumed a nested `@if` inside an `@else` must be wrapped in an element to count as one node. I also assumed attributes such as `disabled={!cam.ready}` and a ternary inside `{}` are allowed.
- I assumed `takePhoto` can reject, for example when access is denied, and that `error.message` is useful to show.
- I assumed the Mac build counts as "a person on a Mac". `platform` is fixed when the app is built, so on the website it cannot tell whether the visitor uses a Mac.
- The website gets a "Copy link" fallback using `navigator.clipboard`, which is my choice and not part of the sheet.
- I assumed `@markless/ui` exports `base` as a value that can be used as `<base.camera>`.

## Website
1. Camera: no preview and no "Take photo" button; the visitor sees a note that taking photos works in the iPhone and Android apps.
2. Location: no location is shown; the visitor sees a note that location works in the iPhone and Android apps.
3. Like: the button works and counts presses; there is no haptic tap.
4. Offline banner: never shown, because network status is not available on the website.
5. Share: a "Copy link" button copies the page's url to the clipboard instead of opening a share panel.
6. Search hint: every website visitor sees "Press Ctrl+K to search", Mac visitors included, because `platform.web` is true whatever system they use.

Tools used: none
