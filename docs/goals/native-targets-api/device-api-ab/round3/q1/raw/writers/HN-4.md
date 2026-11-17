```tsx
// file: Post.tsrx
import { state } from '@markless/core';
import { camera, geolocation, network, haptics, sharesheet, modifierKey } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

function CameraPanel() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let taking = state(false);

	<section>
		<base.camera el={cam} />
		<button
			disabled={!cam.ready || taking}
			onClick={async () => {
				taking = true;
				photo = await cam.takePhoto();
				taking = false;
			}}
		>
			Take photo
		</button>
		@if (cam.access === 'denied') {
			<p>Camera access was refused.</p>
		}
		@if (photo !== null) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</section>
}

function LocationPanel() @{
	const geo = geolocation();

	<p>
		@if (geo.access === 'denied') {
			<span>Location access was refused.</span>
		} @else {
			@if (geo.position === null) {
				<span>Finding you…</span>
			} @else {
				<span>
					{geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
				</span>
			}
		}
	</p>
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

	<>
		@if (!net.online) {
			<div role="status">You are offline</div>
		}
	</>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	<main>
		<OfflineBanner />
		<h1>{title}</h1>
		<CameraPanel />
		<LocationPanel />
		<LikeButton />
		<button onClick={() => sharesheet.open({ title, url })}>Share</button>
		<p>Press {modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search</p>
	</main>
}
```

Confidence: 3/5

## Guesses
- The sheet gives no way to tell which build is running. So the website can't swap in other content. It only gets the "removed feature" defaults.
- I guessed that `@else` can sit right after `@if`, and that one `@if`/`@else` can be nested inside another.
- I guessed that `@if` is allowed directly inside a fragment `<>…</>`, and that a component can have a fragment as its root.
- I guessed that an `async` click handler can assign state after an `await`, and that `disabled={...}` accepts a boolean.
- I guessed that I can read `geo.position.latitude` after a null check inside `@else`, and that the narrowing works there.
- I guessed that `sharesheet.open`, called without `await`, is fine in a handler.
- I left out the share text field. Only the title and url are shared.

## Website
1. The camera preview shows nothing. The "Take photo" button stays disabled because `ready` is always false, so no photo ever appears.
2. The location stays on "Finding you…" for good, because `access` stays 'unknown' and `position` stays null. The refused message never shows.
3. The like counter works. The haptic tap does nothing.
4. The offline banner never shows, because `online` is always true.
5. The Share button does nothing, because the promise from `sharesheet.open` never settles.
6. The hint reads the visitor's system: "Press ⌘K to search" on a Mac, "Press Ctrl+K to search" everywhere else.

Tools used: Read (only to read the instructions file)
