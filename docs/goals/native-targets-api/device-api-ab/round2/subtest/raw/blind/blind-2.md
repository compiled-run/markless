## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	let photo = state<Photo | null>(null);
	let problem = state('');

	const open = async () => {
		problem = '';
		try {
			photo = await takePhoto();
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			problem = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
		}
	};

	<section>
		<button onClick={open}>Take a photo</button>
		@if (problem) {
			<p>{problem}</p>
		}
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo you took" />
		}
	</section>
}
```

Confidence: 3/5

## Task 2

```tsrx
// file: task2/CurrentLocation.tsrx
import { computed } from '@markless/core';
import { currentPosition, openSettings } from '@markless/device';

export default function CurrentLocation() @{
	const position = computed(async () => await currentPosition());

	<section>
		@try {
			<p>
				{position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				@if (error.name === 'NotAllowedError') {
					<p>Location access is off for this app.</p>
				} @else {
					<p>{error.message}</p>
				}
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

Confidence: 3/5

## Task 3

```tsrx
// file: task3/LiveMap.tsrx
import { computed } from '@markless/core';
import { geolocation, openSettings } from '@markless/device';

const ZOOM = 16;
const TILE = 256;

export default function LiveMap() @{
	const here = geolocation({ accuracy: 'high' });

	const worldX = computed(() => ((here.longitude + 180) / 360) * 2 ** ZOOM);
	const worldY = computed(() => {
		const lat = (here.latitude * Math.PI) / 180;
		return ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 2 ** ZOOM;
	});
	const tileX = computed(() => Math.floor(worldX));
	const tileY = computed(() => Math.floor(worldY));
	const pinLeft = computed(() => (worldX - tileX) * TILE);
	const pinTop = computed(() => (worldY - tileY) * TILE);

	<section>
		@if (here.denied) {
			<div>
				<p>Location access is off for this app.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			@if (!here.ready) {
				<p>Finding your location…</p>
			} @else {
				<div style={`position: relative; width: ${TILE}px; height: ${TILE}px; overflow: hidden`}>
					<img
						src={`https://tile.openstreetmap.org/${ZOOM}/${tileX}/${tileY}.png`}
						width={TILE}
						height={TILE}
						alt="Map around you"
					/>
					<span
						aria-label="You are here"
						style={`position: absolute; left: ${pinLeft}px; top: ${pinTop}px; transform: translate(-50%, -100%); font-size: 24px`}
					>
						📍
					</span>
				</div>
			}
		}
	</section>
}
```

Confidence: 2/5

## Task 4

```tsrx
// file: task4/ShareArticle.tsrx
import { share } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	const onShare = async () => {
		try {
			await share({ title, url });
		} catch (error) {
			if ((error as Error).name !== 'AbortError') throw error;
		}
	};

	<button onClick={onShare}>Share</button>
}
```

Confidence: 4/5

## Task 5

```tsrx
// file: task5/LikeButton.tsrx
import { state } from '@markless/core';
import { haptic } from '@markless/device';

export default function LikeButton() @{
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			haptic('light');
		}}
	>
		Like {likes}
	</button>
}
```

Confidence: 4/5

## Task 6

```tsrx
// file: task6/OrderReminder.tsrx
import { state } from '@markless/core';
import { scheduleNotification } from '@markless/device';

export default function OrderReminder({ orderId }: { orderId: number }) @{
	let status = state('');

	const schedule = async () => {
		try {
			await scheduleNotification({
				id: `order-${orderId}`,
				title: 'Your order',
				body: `Check on order #${orderId}.`,
				at: new Date(Date.now() + 60 * 60 * 1000),
				url: `/orders/${orderId}`,
			});
			status = 'Reminder set for one hour from now.';
		} catch (error) {
			status =
				(error as Error).name === 'NotAllowedError'
					? 'Notifications are off for this app.'
					: (error as Error).message;
		}
	};

	<section>
		<button onClick={schedule}>Remind me in an hour</button>
		@if (status) {
			<p>{status}</p>
		}
	</section>
}
```

Used as `<OrderReminder orderId={42} />`.

Confidence: 3/5

## Task 7

```tsrx
// file: task7/CameraPage.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, openSettings, type Photo } from '@markless/device';

export default function CameraPage() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);
	let problem = state('');

	const shoot = async () => {
		problem = '';
		try {
			last = await cam.capture();
		} catch (error) {
			problem = (error as Error).message;
		}
	};

	const useSystem = async () => {
		problem = '';
		try {
			last = await takePhoto();
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			problem = (error as Error).message;
		}
	};

	<main>
		@if (cam.denied) {
			<div>
				<p>Camera access was refused.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<div>
				<camera el={cam} />
				<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
				<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
			</div>
		}
		<button onClick={useSystem}>Use system camera</button>
		@if (problem) {
			<p>{problem}</p>
		}
		@if (last) {
			<img src={last.url} width={last.width} height={last.height} alt="Last photo taken" />
		}
	</main>
}
```

Confidence: 3/5

## Guesses

These `@markless/device` names are not on the sheet. I guessed them from how the camera part is designed:

- `takePhoto(options?: { facing?: Facing }): Promise<Photo>` opens the phone's own camera screen. It resolves with the photo taken. If the person cancels, it rejects with an Error named `'AbortError'`. If access is refused, it rejects with `'NotAllowedError'`.
- `currentPosition(options?: { accuracy?: 'high' | 'low' }): Promise<Position>` reads the location once. A refusal rejects with `'NotAllowedError'`.
- `interface Position { latitude: number; longitude: number; accuracy: number }`
- `geolocation(options?: { accuracy?: 'high' | 'low' }): Geolocation` gives a live position. It works like `camera()`: you call it in a component body, it belongs to that component, its fields update live, and it is released when the component leaves the page.
- `interface Geolocation { readonly ready: boolean; readonly denied: boolean; readonly latitude: number; readonly longitude: number; readonly accuracy: number }`
- `openSettings(): Promise<void>` opens this app's page in the phone's Settings.
- `share(data: { title?: string; text?: string; url?: string }): Promise<void>` opens the share sheet. If the person dismisses it, it rejects with `'AbortError'`.
- `haptic(style?: 'light' | 'medium' | 'heavy'): void`
- `scheduleNotification(options: { id?: string; title: string; body?: string; at: Date; url?: string }): Promise<void>` schedules a local notification. Tapping it opens the app at `url`. A refused permission rejects with `'NotAllowedError'`.

Tools used: none