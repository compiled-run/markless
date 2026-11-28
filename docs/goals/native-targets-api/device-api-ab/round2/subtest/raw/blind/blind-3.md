## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	let photo = state<Photo | null>(null);
	let message = state('');

	<section>
		<button
			onClick={async () => {
				message = '';
				try {
					photo = await takePhoto();
				} catch (error) {
					const e = error as Error;
					if (e.name === 'AbortError') return;
					message = e.name === 'NotAllowedError' ? 'Camera access is off.' : e.message;
				}
			}}
		>
			Take photo
		</button>
		@if (message) {
			<p>{message}</p>
		}
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Photo taken" />
		}
	</section>
}
```

Confidence: 3/5

## Task 2

```tsrx
// file: task2/CurrentLocation.tsrx
import { computed } from '@markless/core';
import { getPosition, openSettings } from '@markless/device';

export default function CurrentLocation() @{
	const here = computed(async () => await getPosition());

	<section>
		@try {
			<p>
				{here.latitude.toFixed(5)}, {here.longitude.toFixed(5)}
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				@if (error.name === 'NotAllowedError') {
					<>
						<p>Location access is turned off.</p>
						<button onClick={() => openSettings()}>Open Settings</button>
						<button onClick={reset}>Try again</button>
					</>
				} @else {
					<>
						<p>{error.message}</p>
						<button onClick={reset}>Try again</button>
					</>
				}
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
import { position } from '@markless/device';

export default function LiveMap() @{
	const here = position();
	const src = computed(() => {
		const p = here.current;
		if (!p) return '';
		const d = 0.005;
		const bbox = [p.longitude - d, p.latitude - d, p.longitude + d, p.latitude + d].join(',');
		return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.latitude},${p.longitude}`;
	});

	<section>
		@if (here.denied) {
			<p>Location access is turned off.</p>
		} @else {
			<>
				@if (src) {
					<iframe title="Your position" src={src} width="100%" height="400" />
				} @else {
					<p>Finding your location…</p>
				}
			</>
		}
	</section>
}
```

Confidence: 2/5. The package probably has no map, so I used an OpenStreetMap embed that reloads each time the position changes.

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

Confidence: 3/5

## Task 6

```tsrx
// file: task6/RemindOrder.tsrx
import { state } from '@markless/core';
import { scheduleNotification } from '@markless/device';

export default function RemindOrder() @{
	let message = state('');

	<section>
		<button
			onClick={async () => {
				try {
					await scheduleNotification({
						title: 'Your order',
						body: 'Check on order #42',
						at: new Date(Date.now() + 60 * 60 * 1000),
						url: '/orders/42',
					});
					message = 'Reminder set for one hour from now.';
				} catch (error) {
					const e = error as Error;
					message = e.name === 'NotAllowedError' ? 'Notifications are turned off.' : e.message;
				}
			}}
		>
			Remind me in an hour
		</button>
		@if (message) {
			<p>{message}</p>
		}
	</section>
}
```

Confidence: 2/5

## Task 7

```tsrx
// file: task7/CameraPage.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, type Photo } from '@markless/device';

export default function CameraPage() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	const report = (error: unknown) => {
		const e = error as Error;
		if (e.name === 'AbortError') return;
		message = e.name === 'NotAllowedError' ? 'Camera access is off.' : e.message;
	};

	<section>
		@if (cam.denied) {
			<p>Camera access is turned off.</p>
		} @else {
			<camera el={cam} />
		}
		<div>
			<button
				disabled={!cam.ready}
				onClick={async () => {
					message = '';
					try {
						photo = await cam.capture();
					} catch (error) {
						report(error);
					}
				}}
			>
				Shutter
			</button>
			<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
			<button
				onClick={async () => {
					message = '';
					try {
						photo = await takePhoto();
					} catch (error) {
						report(error);
					}
				}}
			>
				Use system camera
			</button>
		</div>
		@if (message) {
			<p>{message}</p>
		}
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</section>
}
```

Confidence: 3/5

## Guesses

- `takePhoto(options?: { facing?: Facing }): Promise<Photo>`: opens the phone's own camera screen. If the user cancels, it rejects with an Error whose name is `'AbortError'`.
- `getPosition(): Promise<Position>`: reads the location once.
- `interface Position { latitude: number; longitude: number; accuracy: number }`
- `openSettings(): Promise<void>`: opens this app's page in the phone's Settings.
- `position(): Locator`: called in a component body like `camera()`. Its fields are live, and it is released when the component leaves the page.
- `interface Locator { readonly current: Position | null; readonly denied: boolean }`
- `share(data: { title?: string; text?: string; url?: string }): Promise<void>`: if the user cancels, it rejects with an Error whose name is `'AbortError'`.
- `haptic(style?: 'light' | 'medium' | 'heavy'): void`
- `scheduleNotification(options: { title: string; body?: string; at: Date; url?: string }): Promise<{ id: string; cancel(): Promise<void> }>`: tapping the notification opens `url` in the app. If permission is refused, it rejects with `'NotAllowedError'`.

Tools used: none