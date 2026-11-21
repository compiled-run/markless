## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { systemCamera, type Photo } from '@markless/device';

export default function SystemPhoto() @{
	const sys = systemCamera();
	let photo = state<Photo | null>(null);
	let problem = state('');

	<section>
		<button
			onClick={async () => {
				problem = '';
				try {
					photo = await sys.capture();
				} catch (error) {
					const e = error as Error;
					if (e.name === 'AbortError') return;
					problem = e.name === 'NotAllowedError' ? 'Camera access was refused.' : e.message;
				}
			}}
		>
			Take photo
		</button>
		@if (problem) {
			<p>{problem}</p>
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
import { currentPosition, openSettings } from '@markless/device';

export default function CurrentLocation() @{
	const here = computed(async () => await currentPosition());

	<section>
		@try {
			<p>
				{here.latitude.toFixed(5)}, {here.longitude.toFixed(5)}
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<div>
					<p>Location access is turned off for this app.</p>
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
import { position } from '@markless/device';

const ZOOM = 16;
const TILE = 256;

function worldPixel(lat: number, lon: number) {
	const scale = TILE * 2 ** ZOOM;
	const x = ((lon + 180) / 360) * scale;
	const s = Math.sin((lat * Math.PI) / 180);
	const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
	return { x, y };
}

export default function LiveMap() @{
	const here = position({ accuracy: 'high' });

	const view = computed(() => {
		const coords = here.coords;
		if (!coords) return null;
		const { x, y } = worldPixel(coords.latitude, coords.longitude);
		const tileX = Math.floor(x / TILE);
		const tileY = Math.floor(y / TILE);
		const tiles: { key: string; src: string; left: number; top: number }[] = [];
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				tiles.push({
					key: `${tileX + dx}/${tileY + dy}`,
					src: `https://tile.openstreetmap.org/${ZOOM}/${tileX + dx}/${tileY + dy}.png`,
					left: (dx + 1) * TILE,
					top: (dy + 1) * TILE,
				});
			}
		}
		return {
			tiles,
			pinLeft: x - (tileX - 1) * TILE,
			pinTop: y - (tileY - 1) * TILE,
		};
	});

	<section>
		@if (here.denied) {
			<p>Location access was refused.</p>
		} @else {
			@if (view) {
				<div style={`position:relative;width:${TILE * 3}px;height:${TILE * 3}px;overflow:hidden`}>
					@for (const tile of view.tiles; key tile.key) {
						<img
							src={tile.src}
							alt=""
							style={`position:absolute;left:${tile.left}px;top:${tile.top}px;width:${TILE}px;height:${TILE}px`}
						/>
					}
					<div
						aria-label="You are here"
						style={`position:absolute;left:${view.pinLeft}px;top:${view.pinTop}px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#1a73e8;border:3px solid white`}
					/>
				</div>
			} @else {
				<p>Waiting for your position…</p>
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
		Like {likes}
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

	<section>
		<button
			onClick={async () => {
				try {
					await scheduleNotification({
						title: 'Order 42',
						body: 'Check on your order.',
						at: new Date(Date.now() + 60 * 60 * 1000),
						open: '/orders/42',
					});
					status = 'Reminder set for one hour from now.';
				} catch (error) {
					const e = error as Error;
					status = e.name === 'NotAllowedError' ? 'Notifications are turned off.' : e.message;
				}
			}}
		>
			Remind me in an hour
		</button>
		@if (status) {
			<p>{status}</p>
		}
	</section>
}
```

Confidence: 2/5

## Task 7

```tsrx
// file: task7/DualCamera.tsrx
import { state } from '@markless/core';
import { camera, systemCamera, type Photo } from '@markless/device';

export default function DualCamera() @{
	const cam = camera({ facing: 'back' });
	const sys = systemCamera();
	let photo = state<Photo | null>(null);
	let problem = state('');

	async function take(source: () => Promise<Photo>) {
		problem = '';
		try {
			photo = await source();
		} catch (error) {
			const e = error as Error;
			if (e.name === 'AbortError') return;
			problem = e.name === 'NotAllowedError' ? 'Camera access was refused.' : e.message;
		}
	}

	<section>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<div>
			<button disabled={!cam.ready} onClick={() => take(() => cam.capture())}>
				Shutter
			</button>
			<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
			<button onClick={() => take(() => sys.capture())}>Use system camera</button>
		</div>
		@if (problem) {
			<p>{problem}</p>
		}
		@if (photo) {
			<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
		}
	</section>
}
```

Confidence: 3/5

## Guesses

- `systemCamera(): SystemCamera` creates an object that belongs to the component, like `camera()`. It has `interface SystemCamera { capture(): Promise<Photo> }`, which opens the phone's own camera screen. If the user cancels, it rejects with an Error whose name is `'AbortError'`. If access is refused, the name is `'NotAllowedError'`.
- `currentPosition(options?: { accuracy?: 'high' | 'low' }): Promise<Coords>` reads the location once.
- `interface Coords { latitude: number; longitude: number; accuracy: number }`
- `position(options?: { accuracy?: 'high' | 'low' }): PositionWatch` gives a live position that belongs to the component and is released when the component leaves the page.
- `interface PositionWatch { readonly ready: boolean; readonly denied: boolean; readonly coords: Coords | null }`
- `openSettings(): Promise<void>` opens this app's page in the phone's Settings.
- `share(data: { title?: string; text?: string; url?: string }): Promise<void>` rejects with `'AbortError'` if the user dismisses the share sheet.
- `haptic(kind?: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'): void`
- `scheduleNotification(options: { title: string; body?: string; at: Date; open?: string }): Promise<{ id: string; cancel(): Promise<void> }>` asks for permission when needed. Tapping the notification goes to the `open` path in the app.

Tools used: none