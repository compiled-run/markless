You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks; `shared()` and `storage()` come from Markless itself (`@markless/core`).

This app is built from one codebase as an iPhone app, an Android app, a Mac app and a website. `@markless/device` is a package of device features; `base.camera` from `@markless/ui` shows a camera. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, geolocation, haptics, modifierKey, network, sharesheet, type Photo } from '@markless/device';

function OfflineBanner() @{
	const net = network();

	<>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
	</>
}

function Shooter() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<section>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}

function Whereabouts() @{
	const here = geolocation();

	<section>
		@if (here.access === 'denied') {
			<p>Location access is off.</p>
		} @else if (here.position) {
			<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
		} @else {
			<p>Finding you…</p>
		}
	</section>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let shareNote = state('');

	<main>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<></>
		}
		<h1>{title}</h1>
		<p>{`Press ${modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search`}</p>
		@try {
			<Shooter />
		} @catch (error) {
			<p>The camera works in the app.</p>
		}
		@try {
			<Whereabouts />
		} @catch (error) {
			<p>Location works in the app.</p>
		}
		<button
			onClick={() => {
				likes++;
				try {
					haptics.tap('light');
				} catch {}
			}}
		>
			{`Like (${likes})`}
		</button>
		<button
			onClick={async () => {
				try {
					await sharesheet.open({ title, url });
				} catch {
					shareNote = 'Sharing works in the app.';
				}
			}}
		>
			Share
		</button>
		@if (shareNote) {
			<p>{shareNote}</p>
		}
	</main>
}
```
=== END CODE ===

Questions:
1. A visitor opens the website in a browser on a Mac laptop. For each piece of the page, what do they see, and what happens when they use it? (a) the camera and Take photo, (b) the location, (c) Like, (d) the offline banner, if their connection drops, (e) Share, (f) the search hint.
2. Someone uses the iPhone app. Same six pieces, (a) to (f).
3. Does any button do nothing when pressed? Which, and for whom?
4. Which lines exist or run only in some builds? Quote them and name the builds.
5. How sure are you of your answer to question 1 (1–5)? What would you need to know to be sure?

Output format: lines `1a:` … `1f:`, `2a:` … `2f:`, `3:`, `4:`, `5:`; end with `Tools used: none`.
