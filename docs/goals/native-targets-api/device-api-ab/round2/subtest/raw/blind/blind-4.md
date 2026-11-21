## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	let photo = state<Photo | null>(null);
	let problem = state('');

	<section>
		<button
			onClick={async () => {
				problem = '';
				try {
					photo = await takePhoto();
				} catch (error) {
					if ((error as Error).name === 'NotAllowedError') problem = 'Camera access was refused.';
					else if ((error as Error).name !== 'AbortError') problem = (error as Error).message;
				}
			}}
		>
			Take photo
		</button>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo taken" />
		}
		@if (problem) {
			<p role="alert">{problem}</p>
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
	const here = computed(async ({ signal }) => await currentPosition({ signal }));

	<section>
		@try {
			<p>
				{here.latitude.toFixed(5)}, {here.longitude.toFixed(5)} (±{Math.round(here.accuracy)} m)
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<div>
					<p>Location access is off. Turn it on in Settings to see where you are.</p>
					<button onClick={() => openSettings()}>Open Settings</button>
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

Confidence: 3/5

## Task 3

```tsrx
// file: task3/LiveMap.tsrx
import { computed } from '@markless/core';
import { location } from '@markless/device';

const ZOOM = 16;
const TILE = 256;

export default function LiveMap() @{
	const here = location({ watch: true });

	const world = computed(() => {
		const scale = 2 ** ZOOM;
		const x = ((here.longitude + 180) / 360) * scale;
		const latRad = (here.latitude * Math.PI) / 180;
		const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
		return { x, y };
	});
	const tileX = computed(() => Math.floor(world.x));
	const tileY = computed(() => Math.floor(world.y));
	const tileUrl = computed(() => `https://tile.openstreetmap.org/${ZOOM}/${tileX}/${tileY}.png`);
	const pinLeft = computed(() => `${(world.x - tileX) * TILE}px`);
	const pinTop = computed(() => `${(world.y - tileY) * TILE}px`);

	<section>
		@if (here.denied) {
			<p>Location access is off, so your position cannot be shown.</p>
		} @else {
			@if (here.ready) {
				<div class="map" style={{ position: 'relative', width: `${TILE}px`, height: `${TILE}px` }}>
					<img src={tileUrl} width={TILE} height={TILE} alt="Map around your position" />
					<span
						class="pin"
						aria-label="You are here"
						style={{
							position: 'absolute',
							left: pinLeft,
							top: pinTop,
							transform: 'translate(-50%, -100%)',
						}}
					>
						📍
					</span>
				</div>
			} @else {
				<p>Finding your location…</p>
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
	<button
		onClick={async () => {
			try {
				await share({ title, url });
			} catch (error) {
				if ((error as Error).name !== 'AbortError') throw error;
			}
		}}
	>
		Share
	</button>
}
```

Confidence: 3/5

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
		♥ {likes}
	</button>
}
```

Confidence: 4/5

## Task 6

```tsrx
// file: task6/OrderReminder.tsrx
import { state } from '@markless/core';
import { scheduleNotification, openSettings } from '@markless/device';

export default function OrderReminder({ orderId }: { orderId: number }) @{
	let status = state<'idle' | 'scheduled' | 'denied' | 'failed'>('idle');

	<section>
		<button
			onClick={async () => {
				try {
					await scheduleNotification({
						id: `order-${orderId}`,
						title: 'Your order',
						body: `Check on order #${orderId}`,
						at: new Date(Date.now() + 60 * 60 * 1000),
						url: `/orders/${orderId}`,
					});
					status = 'scheduled';
				} catch (error) {
					status = (error as Error).name === 'NotAllowedError' ? 'denied' : 'failed';
				}
			}}
		>
			Remind me in an hour
		</button>
		@if (status === 'scheduled') {
			<p>Reminder set for one hour from now.</p>
		}
		@if (status === 'denied') {
			<p>
				Notifications are off.
				<button onClick={() => openSettings()}>Open Settings</button>
			</p>
		}
		@if (status === 'failed') {
			<p>Could not set the reminder.</p>
		}
	</section>
}
```

Used as `<OrderReminder orderId={42} />`.

Confidence: 3/5

## Task 7

```tsrx
// file: task7/CameraScreen.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, type Photo } from '@markless/device';

export default function CameraScreen() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<div>
			<button disabled={!cam.ready} onClick={async () => (photo = await cam.capture())}>
				Shutter
			</button>
			<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
			<button
				onClick={async () => {
					try {
						photo = await takePhoto();
					} catch (error) {
						if ((error as Error).name !== 'AbortError') throw error;
					}
				}}
			>
				Use system camera
			</button>
		</div>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</section>
}
```

Confidence: 3/5

## Guesses

- `takePhoto(options?: { facing?: Facing }): Promise<Photo>` opens the phone's own camera screen. It rejects with `AbortError` if the user cancels and `NotAllowedError` if access is refused.
- `currentPosition(options?: { signal?: AbortSignal }): Promise<Position>` gives a one-time location reading. It rejects with `NotAllowedError` when access is refused.
- `interface Position { latitude: number; longitude: number; accuracy: number }`
- `location(options?: { watch?: boolean }): Location` is a live object, like `camera`. It is called in a component body and released when the component leaves the page.
- `interface Location { readonly ready: boolean; readonly denied: boolean; readonly latitude: number; readonly longitude: number; readonly accuracy: number }`
- `openSettings(): Promise<void>` opens this app's page in the phone's Settings.
- `share(data: { title?: string; text?: string; url?: string }): Promise<void>` opens the system share sheet. It rejects with `AbortError` if the user dismisses it.
- `haptic(style?: 'light' | 'medium' | 'heavy' | 'selection'): void`
- `scheduleNotification(options: { id?: string; title: string; body?: string; at: Date; url?: string }): Promise<void>` asks for permission if needed and rejects with `NotAllowedError` if it is refused. Tapping the notification opens `url` in the app.

Tools used: none