```tsrx
// file: CameraPanel.tsrx
import { state } from '@markless/core';
import { camera, platform, type Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let failure = state('');

	const take = async () => {
		if (!(platform.ios || platform.android)) return;
		try {
			failure = '';
			photo = await cam.takePhoto();
		} catch (error) {
			failure = (error as Error).message;
		}
	};

	<section>
		@if (platform.ios || platform.android) {
			<>
				@if (cam.access === 'denied') {
					<p>Camera access was refused.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button onClick={take} disabled={!cam.ready}>Take photo</button>
						@if (failure !== '') {
							<p>{failure}</p>
						}
						@if (photo !== null) {
							<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
						}
					</>
				}
			</>
		}
	</section>
}
```

```tsrx
// file: LocationPanel.tsrx
import { geolocation, platform } from '@markless/device';

export default function LocationPanel() @{
	const geo = geolocation();

	<section>
		@if (platform.ios || platform.android) {
			<>
				@if (geo.access === 'denied') {
					<p>Location access was refused, so we cannot show where you are.</p>
				} @else {
					<>
						@if (geo.position === null) {
							<p>Finding you…</p>
						} @else {
							<p>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
							</p>
						}
					</>
				}
			</>
		}
	</section>
}
```

```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { haptics, network, platform, sharesheet } from '@markless/device';
import CameraPanel from './CameraPanel.tsrx';
import LocationPanel from './LocationPanel.tsrx';

export default function Post({ title, url }: { title: string; url: string }) @{
	const net = network();
	let likes = state(0);
	let copied = state(false);

	const webOnMac =
		platform.web && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const searchHint = platform.macos || webOnMac ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	const like = () => {
		likes++;
		haptics.tap('light');
	};

	const share = async () => {
		if (!(platform.ios || platform.android)) return;
		await sharesheet.open({ title, url });
	};

	const copyLink = async () => {
		await navigator.clipboard.writeText(url);
		copied = true;
	};

	<main>
		@if ((platform.ios || platform.android) && !net.online) {
			<div role="status">You are offline</div>
		}
		<h1>{title}</h1>
		<p>{searchHint}</p>
		<CameraPanel />
		<LocationPanel />
		<button onClick={like}>Like ({likes})</button>
		@if (platform.ios || platform.android) {
			<button onClick={share}>Share</button>
		} @else {
			<p>
				<a href={url}>{title}</a>
				<button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
			</p>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed code inside a guarded `@if` counts as guarded, including the handlers there. I still added an early-return guard inside the `take` and `share` handlers to be safe.
- I assumed that making `camera()`, `geolocation()` and `network()` in a component body, outside any guard, is allowed in every build, as the sheet says.
- I assumed `@if (A && !net.online)` matches the allowed guard form "starts with `(platform.ios || platform.android) &&`".
- I assumed nested `@if` / `@else` blocks inside a fragment are fine, and that a ternary inside `{}` is allowed.
- I assumed `takePhoto` can reject, so I catch the error and show its message.
- I assumed checking `navigator.platform` in the body is acceptable for website visitors on a Mac. If the page renders on the server first, the server and browser may disagree about this text. The sheet says `platform.web` cannot tell a Mac visitor apart.
- I assumed `navigator.clipboard` works for the copy-link fallback in both the website and the Mac build.
- I assumed `disabled={!cam.ready}` is fine to use, even though `takePhoto` already waits until the camera is ready.

## Website
1. No camera section. That part of the page is empty.
2. No location text. That part of the page is empty.
3. The like button works and counts presses. There is no haptic tap, because the call does nothing outside the phone builds.
4. No offline banner is ever shown.
5. Instead of a share button: a link to the page plus a "Copy link" button that copies the url to the clipboard.
6. "Press ⌘K to search" if the browser reports a Mac (or an iPhone or iPad), and "Press Ctrl+K to search" otherwise.

Tools used: Read (once, to read the instructions file)
