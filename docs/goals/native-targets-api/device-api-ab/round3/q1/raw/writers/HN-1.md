```tsx
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
	let likes = state(0);
	const hint = modifierKey === '⌘' ? 'Press ⌘K to search' : 'Press Ctrl+K to search';

	<main>
		@if (!net.online) {
			<div role="status">You are offline</div>
		}
		<h1>{title}</h1>
		<p>{hint}</p>

		<section>
			<base.camera el={cam} />
			<button
				disabled={!cam.ready}
				onClick={async () => {
					photo = await cam.takePhoto();
				}}
			>
				Take photo
			</button>
			@if (photo !== null) {
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
			}
		</section>

		<section>
			@if (geo.access === 'denied') {
				<p>Location access was refused.</p>
			} @else {
				@if (geo.position === null) {
					<p>Finding you…</p>
				} @else {
					<p>
						{geo.position.latitude.toFixed(5)}, {geo.position.longitude.toFixed(5)} (±{Math.round(geo.position.accuracy)} m)
					</p>
				}
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

		<button onClick={() => sharesheet.open({ title, url })}>Share</button>
	</main>
}
```

Confidence: 3/5

## Guesses
- I assumed `@if … @else` can nest inside an `@else` block, since each block holds exactly one node.
- I assumed `!cam.ready` is a good way to disable the "Take photo" button. On the website it stays disabled because `ready` stays false.
- I assumed an async handler can assign state after `await`.
- I assumed `type Photo` can be imported from `@markless/device`.
- I assumed `@if` can read the fields of `geo.position` after checking it is not null, and that types narrow there.
- I assumed `{a}, {b}` text interpolation works inside one `<p>`.
- The sheet gives no way to detect which build is running. Because of that, the website can't be given a different location message, and there's no fallback to the browser's own share feature.
- I assumed `disabled`, `width`, `height` and `alt` pass straight through as attributes.

## Website
1. The camera element shows nothing, and the "Take photo" button stays disabled because `ready` never becomes true. No photo is ever shown.
2. The page shows "Finding you…" for good: `position` stays null and `access` stays 'unknown', so the refused message never appears.
3. The like button counts presses normally. The haptic tap does nothing.
4. The offline banner never appears because `online` stays true.
5. The share button is there, but clicking it does nothing: the promise never settles and no share panel opens.
6. The hint reads the visitor's system. Mac visitors see "Press ⌘K to search" and everyone else sees "Press Ctrl+K to search".

Tools used: Read (once, to read the instructions file)
