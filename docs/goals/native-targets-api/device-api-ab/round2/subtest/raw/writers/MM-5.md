## Task 1
```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { cameraScreen, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	const screen = cameraScreen();
	let photo = state<Photo | null>(null);

	<div>
		<button
			onClick={async () => {
				const taken = await screen.open();
				if (taken) photo = taken;
			}}
		>
			Take photo
		</button>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo taken" />
		}
	</div>
}
```
Confidence: 4/5

## Task 2
```tsrx
// file: task2/CurrentLocation.tsrx
import { computed } from '@markless/core';
import { location, settings } from '@markless/device';

export default function CurrentLocation() @{
	const loc = location();
	const phoneSettings = settings();
	const here = computed(async () => await loc.current());

	<section>
		@try {
			<p>
				{here.latitude}, {here.longitude} (±{here.accuracy} m)
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<div>
					<p>Location access was refused.</p>
					<button onClick={() => phoneSettings.open()}>Open Settings</button>
					<button onClick={reset}>Try again</button>
				</div>
			} @else {
				<div>
					<p>{error.message}</p>
					<button onClick={reset}>Try again</button>
				</div>
			}
		}
	</section>
}
```
Confidence: 4/5

## Task 3
```tsrx
// file: task3/LiveMap.tsrx
import { location, mapview } from '@markless/device';

export default function LiveMap() @{
	const loc = location();
	const map = mapview({ zoom: 15 });
	const Pin = map.pin;

	<div>
		@if (loc.denied) {
			<p>Location access was refused.</p>
		}
		<mapview el={map}>
			@if (loc.position) {
				<Pin at={{ latitude: loc.position.latitude, longitude: loc.position.longitude }} />
			}
		</mapview>
	</div>
}
```
Confidence: 3/5

## Task 4
```tsrx
// file: task4/ShareArticle.tsrx
import { sharing } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	const share = sharing();

	<button onClick={() => share.share({ title, url })}>Share</button>
}
```
Confidence: 4/5

## Task 5
```tsrx
// file: task5/LikeButton.tsrx
import { state } from '@markless/core';
import { haptics } from '@markless/device';

export default function LikeButton() @{
	const buzz = haptics();
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			buzz.tap('light');
		}}
	>
		Like ({likes})
	</button>
}
```
Confidence: 5/5

## Task 6
```tsrx
// file: task6/OrderReminder.tsrx
import { state } from '@markless/core';
import { notifications } from '@markless/device';

export default function OrderReminder() @{
	const notify = notifications();
	let status = state('');

	<div>
		<button
			onClick={async () => {
				try {
					await notify.schedule({
						title: 'Order 42',
						body: 'Check on your order.',
						at: new Date(Date.now() + 60 * 60 * 1000),
						url: '/orders/42',
					});
					status = 'Reminder set for one hour from now.';
				} catch (error) {
					status = (error as Error).name === 'NotAllowedError'
						? 'Notifications are turned off.'
						: (error as Error).message;
				}
			}}
		>
			Remind me in an hour
		</button>
		<p>{status}</p>
	</div>
}
```
Confidence: 4/5

## Task 7
```tsrx
// file: task7/DualCamera.tsrx
import { state } from '@markless/core';
import { camera, cameraScreen, type Photo } from '@markless/device';

export default function DualCamera() @{
	const cam = camera({ facing: 'back' });
	const screen = cameraScreen();
	let last = state<Photo | null>(null);

	<div>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => (last = await cam.capture())}>
			Shutter
		</button>
		<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
		<button
			onClick={async () => {
				const taken = await screen.open();
				if (taken) last = taken;
			}}
		>
			Use system camera
		</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
	</div>
}
```
Confidence: 3/5

## Guesses
- I assumed that writing state after an `await` inside a handler updates the page, as it would for a synchronous write.
- I assumed `@if`/`@else` can sit inside `@catch` and branch on `error.name`, and that calling `reset` runs the async computed (here, `loc.current()`) again.
- I assumed a refused permission makes `current()` reject with `NotAllowedError`, so the error lands in `@catch`. I did not use the `denied` field for this.
- I assumed `map.pin` can be pulled into a capitalised local (`const Pin = map.pin`) and used as a component inside `<mapview el={map}>`. I also assumed TypeScript narrows `loc.position` inside `@if`.
- I assumed that reading `loc.position` in the markup starts the live watch, and that the pin follows it. The map's center does not follow the person. That was not asked for, so the person can move off screen.
- I assumed `<camera el={cam} />` can sit inside `@if`/`@else` without breaking `ready`. I also assumed TypeScript accepts the custom `camera`/`mapview` tags with an `el` prop, and that `disabled` on the shutter is optional because `capture()` waits until the camera is ready.
- In Task 4 I assumed the article's title and url arrive as props. I assumed `schedule()` throws `NotAllowedError` when notifications are refused.

Tools used: none