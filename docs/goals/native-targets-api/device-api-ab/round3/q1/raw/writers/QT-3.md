```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import {
	camera,
	geolocation,
	haptics,
	modifierKey,
	network,
	sharesheet,
	type Photo,
} from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let photo = state<Photo | null>(null);
	let likes = state(0);

	async function takePhoto() {
		if (!camera.supported) return;
		photo = await cam.takePhoto();
	}

	async function share() {
		if (!sharesheet.supported) return;
		await sharesheet.open({ title, url });
	}

	function like() {
		likes++;
		haptics.tap('light');
	}

	<main>
		@if (network.supported && !net.online) {
			<div role="status">You are offline</div>
		}

		<h1>{title}</h1>

		@if (camera.supported) {
			<section>
				@if (cam.access === 'denied') {
					<p>Camera access was refused.</p>
				} @else {
					<>
						<base.camera el={cam} />
						<button onClick={takePhoto} disabled={!cam.ready}>Take photo</button>
						@if (photo) {
							<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
						}
					</>
				}
			</section>
		} @else {
			<p>The camera is available in the iPhone and Android apps.</p>
		}

		@if (geolocation.supported) {
			<p>
				@if (geo.access === 'denied') {
					<span>Location access was refused.</span>
				} @else {
					<>
						@if (geo.position) {
							<span>
								You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
							</span>
						} @else {
							<span>Finding you…</span>
						}
					</>
				}
			</p>
		} @else {
			<p>Your location is shown in the iPhone and Android apps.</p>
		}

		<button onClick={like}>Like ({likes})</button>

		@if (sharesheet.supported) {
			<button onClick={share}>Share</button>
		} @else {
			<a href={url}>{url}</a>
		}

		<p>Press {modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `@if (photo)` and `@if (geo.position)` narrow the type from `null` the way TypeScript does, so the fields can be read inside the block.
- I assumed an `@if`/`@else` inside a fragment counts as the one node an `@else` block may hold.
- I assumed the build sees a handler that starts with `if (!feature.supported) return;` as guarded, even when it is declared in the component body and not inline. The `@if` around the buttons also guards them.
- I assumed `takePhoto()` resolves even before the camera is ready, because it waits. I still disable the button until `cam.ready` is true.
- I assumed that making `camera()`, `geolocation()` and `network()` objects with no guard is harmless on the website, since only reading them needs a guard.
- I used `{ facing: 'back' }` for the camera and degree coordinates for the location text. Neither format is given in the task.
- I assumed the device asks for camera and location permission when the camera element appears or the location is first read.

## Website
1. Camera: a line saying the camera is available in the iPhone and Android apps. There is no preview, no button and no photo.
2. Location: a line saying the location is shown in the iPhone and Android apps. It never says "Finding you…".
3. Like: the button works and counts presses. There is no haptic tap (the tap does nothing on the website).
4. Offline banner: never shown, because the website gets no network feature.
5. Share: a plain link showing the page's url, not a share button.
6. Hint: "Press ⌘K to search" on an Apple system and "Press Ctrl+K to search" on everything else, based on the visitor's system.

Tools used: Read (once, to read the instructions file)
