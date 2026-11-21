## Task 1
```tsrx
// file: task1/SystemCameraPhoto.tsrx
import { state } from '@markless/core';
import { cameraScreen, type Photo } from '@markless/device';

export default function SystemCameraPhoto() @{
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
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo you took" />
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
	const appSettings = settings();
	const here = computed(async () => await loc.current());

	<section>
		@try {
			<p>
				{here.latitude}, {here.longitude} (within {here.accuracy} m)
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<div>
					<p>Location access is turned off for this app.</p>
					<button onClick={() => appSettings.open()}>Open Settings</button>
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
	const where = location();
	const m = mapview({ zoom: 15 });

	<div>
		<mapview el={m}>
			@if (where.position) {
				<m.pin at={{ latitude: where.position.latitude, longitude: where.position.longitude }} />
			}
		</mapview>
		<button
			onClick={() => {
				const p = where.position;
				if (p) m.center = { latitude: p.latitude, longitude: p.longitude };
			}}
		>
			Center on me
		</button>
		@if (where.denied) {
			<p>Location access is turned off for this app.</p>
		}
	</div>
}
```
Confidence: 3/5

## Task 4
```tsrx
// file: task4/ShareArticle.tsrx
import { sharing } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	const sheet = sharing();

	<button onClick={() => sheet.share({ title, url })}>Share</button>
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
						title: 'Your order',
						body: 'Check on order 42.',
						at: new Date(Date.now() + 60 * 60 * 1000),
						url: '/orders/42',
					});
					status = 'Reminder set for one hour from now.';
				} catch (error) {
					status =
						(error as Error).name === 'NotAllowedError'
							? 'Notifications are turned off for this app.'
							: (error as Error).message;
				}
			}}
		>
			Remind me in an hour
		</button>
		@if (status) {
			<p>{status}</p>
		}
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
	let photo = state<Photo | null>(null);

	<div>
		@if (cam.denied) {
			<p>Camera access is turned off for this app.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.capture())}>
			Shutter
		</button>
		<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
		<button
			onClick={async () => {
				const taken = await screen.open();
				if (taken) photo = taken;
			}}
		>
			Use system camera
		</button>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</div>
}
```
Confidence: 4/5

## Guesses
- A device-object pin is written as `<m.pin at={...} />` inside `<mapview el={m}>`, and an `@if` is allowed as the only child there.
- Reading `where.position` in the markup counts as reading it, so the location watch starts and the pin moves on its own. Because there are no effects, I did not make the map follow the person automatically. A "Center on me" button sets `m.center` instead.
- `@if (error.name === 'NotAllowedError')` is allowed inside `@catch`, since only the handlers there are barred from reading `error`. Calling `reset` runs the async computed again, which calls `current()` again.
- An `@if` on a nullable state such as `photo` narrows its type for the block inside.
- A rejected `current()` call turns into the `@catch` error. I did not use the `denied` field for task 2.
- Async handlers such as `async () => (photo = await ...)` can assign state after an `await`.
- Turning off the shutter until `cam.ready` is true is my choice. `capture()` would wait for the camera anyway.
- In task 6 I guessed that `schedule()` rejects with a `NotAllowedError` when notification permission is refused. The sheet does not say this.
- `<camera>` can sit inside `@if`/`@else` and still be "its element on screen" for `ready`.

Tools used: none