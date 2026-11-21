```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import {
	camera,
	geolocation,
	network,
	haptics,
	sharesheet,
	modifierKey,
	type Photo,
} from '@markless/device';
import { base } from '@markless/ui';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera({ facing: 'back' });
	const geo = geolocation();
	const net = network();

	let photo = state<Photo | null>(null);
	let photoError = state('');
	let likes = state(0);

	<main>
		@if (network.supported && !net.online) {
			<div role="status" class="offline-banner">You are offline</div>
		}

		<h1>{title}</h1>

		<section class="camera">
			@if (camera.supported) {
				<>
					@if (cam.access === 'denied') {
						<p>Camera access was refused. Allow it in Settings to take photos.</p>
					} @else {
						<>
							<base.camera el={cam} />
							<button
								disabled={!cam.ready}
								onClick={async () => {
									if (!camera.supported) return;
									try {
										photoError = '';
										photo = await cam.takePhoto();
									} catch (error) {
										photoError = (error as Error).message;
									}
								}}
							>
								Take photo
							</button>
						</>
					}
					@if (photoError) {
						<p role="alert">{photoError}</p>
					}
					@if (photo) {
						<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
					}
				</>
			} @else {
				<p>Taking photos is available in the iPhone and Android apps.</p>
			}
		</section>

		<section class="location">
			@if (geolocation.supported) {
				<>
					@if (geo.access === 'denied') {
						<p>Location access was refused, so we can't show where you are.</p>
					} @else {
						<>
							@if (geo.position) {
								<p>
									You are at {geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (within {Math.round(geo.position.accuracy)} m)
								</p>
							} @else {
								<p>Finding you…</p>
							}
						</>
					}
				</>
			} @else {
				<p>Your location is shown in the iPhone and Android apps.</p>
			}
		</section>

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
			<p>
				Share this post: <a href={url}>{title}</a>
			</p>
		}

		<p class="hint">Press {modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed a nested `@if` or `@else` block counts as one node. To be safe I wrapped mixed or nested blocks in `<>…</>`.
- I assumed a handler inside a guarded `@if` still needs its own `if (!feature.supported) return;` before it awaits a method, so I added one.
- I assumed `@if (network.supported && !net.online)` is a valid guard, because the sheet says a guard test may start with `feature.supported &&`.
- I assumed it is fine to make `camera()`, `geolocation()` and `network()` unguarded in the body, since making a feature object "may stand anywhere". I also assumed reading `cam.access` and `cam.ready` inside the guarded block is allowed.
- I assumed the camera and location objects in `Post` count as "made in this component" for `<base.camera el={cam} />`.
- I assumed `takePhoto()` rejects when it fails, and that `error.message` is a useful text to show.
- I assumed the `disabled` attribute and props such as `title` can be read directly.
- I assumed a "Finding you…" state is wanted while `access` is still `'unknown'`, so it shows until the first position arrives or access is denied.

## Website
1. Camera: a note that taking photos is available in the iPhone and Android apps. There is no preview and no button.
2. Location: a note that your location is shown in the iPhone and Android apps.
3. Like button: works and counts presses. The haptic tap does nothing.
4. Offline banner: never shown, because the website has no network feature.
5. Share: a plain link to the post (its title linked to `url`) instead of the share button.
6. Hint: "Press ⌘K to search" for visitors on Apple systems and "Press Ctrl+K to search" for everyone else, based on the visitor's system.

Tools used: Read (once, to read the instructions file only)
