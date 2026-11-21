## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	let photo = state<Photo | null>(null);
	let failure = state('');

	<main>
		<button
			onClick={async () => {
				failure = '';
				try {
					const taken = await takePhoto();
					if (taken) photo = taken;
				} catch (error) {
					failure = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
				}
			}}
		>
			Take photo
		</button>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo you took" />
		}
		@if (failure) {
			<p>{failure}</p>
		}
	</main>
}
```

Confidence: 3/5

## Task 2

```tsrx
// file: task2/WhereAmI.tsrx
import { computed } from '@markless/core';
import { getPosition, openSettings } from '@markless/device';

export default function WhereAmI() @{
	const position = computed(async ({ signal }) => await getPosition({ signal }));

	<main>
		@try {
			<p>
				{position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				@if (error.name === 'NotAllowedError') {
					<>
						<p>Location access is off for this app.</p>
						<button onClick={() => openSettings()}>Open Settings</button>
					</>
				} @else {
					<p>{error.message}</p>
				}
				<button onClick={reset}>Try again</button>
			</div>
		}
	</main>
}
```

Confidence: 3/5

## Task 3

```tsrx
// file: task3/LiveMap.tsrx
import { computed } from '@markless/core';
import { geolocation } from '@markless/device';

export default function LiveMap() @{
	const geo = geolocation({ watch: true });
	const src = computed(() => {
		const p = geo.position;
		if (!p) return '';
		const d = 0.005;
		const bbox = `${p.longitude - d},${p.latitude - d},${p.longitude + d},${p.latitude + d}`;
		return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.latitude},${p.longitude}`;
	});

	<main>
		@if (geo.denied) {
			<p>Location access is refused.</p>
		} @else {
			@if (geo.position) {
				<iframe title="Your position" src={src} width="100%" height="400" />
			} @else {
				<p>Finding your location…</p>
			}
		}
	</main>
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
		Like ({likes})
	</button>
}
```

Confidence: 4/5

## Task 6

```tsrx
// file: task6/RemindOrder.tsrx
import { state } from '@markless/core';
import { scheduleNotification } from '@markless/device';

export default function RemindOrder() @{
	let status = state('');

	<main>
		<button
			onClick={async () => {
				try {
					await scheduleNotification({
						id: 'order-42',
						title: 'Your order',
						body: 'Check on order 42',
						at: new Date(Date.now() + 60 * 60 * 1000),
						url: '/orders/42',
					});
					status = 'Reminder set for one hour from now.';
				} catch (error) {
					status = (error as Error).name === 'NotAllowedError' ? 'Notifications are turned off for this app.' : (error as Error).message;
				}
			}}
		>
			Remind me in an hour
		</button>
		<p>{status}</p>
	</main>
}
```

Confidence: 3/5

## Task 7

```tsrx
// file: task7/CameraPage.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, type Photo } from '@markless/device';

export default function CameraPage() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<main>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.capture())}>
			Shutter
		</button>
		<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
		<button
			onClick={async () => {
				const taken = await takePhoto();
				if (taken) photo = taken;
			}}
		>
			Use system camera
		</button>
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo taken" />
		}
	</main>
}
```

Confidence: 3/5

## Guesses

- `takePhoto(options?: { facing?: Facing }): Promise<Photo | null>`: opens the phone's own camera screen. Resolves `null` if the person cancels, and rejects with `NotAllowedError` if access is refused.
- `interface Position { latitude: number; longitude: number; accuracy: number }`
- `getPosition(options?: { signal?: AbortSignal }): Promise<Position>`: reads the location once. Rejects with `NotAllowedError` if access is refused.
- `openSettings(): Promise<void>`: opens this app's page in the system Settings.
- `geolocation(options?: { watch?: boolean }): Geolocation`, with `interface Geolocation { readonly position: Position | null; readonly denied: boolean }`. Call it in a component body. Its fields are live and it is released when the component leaves the page, the same as `camera()`.
- `share(data: { title?: string; text?: string; url?: string }): Promise<void>`: rejects with `AbortError` if the person dismisses the share screen.
- `haptic(kind?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): void`
- `scheduleNotification(options: { id?: string; title: string; body?: string; at: Date; url?: string }): Promise<void>`: tapping the notification opens `url` in the app. Rejects with `NotAllowedError` if notifications are refused.

Tools used: none