You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Below is code for the same app written five ways, one per design of a phone device API (`@markless/device`) for Markless, a UI framework whose components are written in `.tsrx` files. Each design has a two-letter label. You get the code only, no documentation. In `.tsrx`, a component body is `@{ statements; one root element }`, runs once, and `state()` values update the page when assigned; `@if`, `@else` and `@for` are template blocks.

The tasks the code solves:
- Task 1: camera screen
- Task 3: one camera shows the picture and reports QR codes
- Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
- Task 5: voice memo
- Task 6: map with pins, "Recenter on me", and a separate search page

=== DESIGN KJ ===
### Task 1: camera screen
```tsrx
// file: task1/Shooter.tsrx
import { element, state } from '@markless/core';
import { device, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let cam = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let denied = state(false);

	<section>
		@if (denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => device.openSettings()}>Open Settings</button>
			</div>
		} @else {
			<device.camera el={cam} facing={facing} onReady={() => (ready = true)} onDenied={() => (denied = true)} />
		}
		<button disabled={!ready} onClick={async () => { if (cam) photo = await cam.takePhoto(); }}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 3: one camera shows the picture and reports QR codes
```tsrx
// file: task3/Scanner.tsrx
import { element, state } from '@markless/core';
import { device, type CameraElement, type Photo } from '@markless/device';

export default function Scanner() @{
	let cam = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let denied = state(false);
	let code = state('');

	<section>
		@if (denied) {
			<p>Camera access is off.</p>
		} @else {
			<device.camera
				el={cam}
				scan={['qr']}
				onScan={(text) => {
					if (text !== code) code = text;
				}}
				onReady={() => (ready = true)}
				onDenied={() => (denied = true)}
			/>
		}
		<button disabled={!ready} onClick={async () => { if (cam) photo = await cam.takePhoto(); }}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
```tsrx
// file: task4/Review.tsrx
import { element, state } from '@markless/core';
import { device, type CameraElement, type Photo } from '@markless/device';

export default function Review() @{
	let cam = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let denied = state(false);

	// Relies on a device element releasing its device when it leaves the markup: the @if removes <device.camera> while the panel shows.
	<section>
		@if (denied) {
			<p>Camera access is off.</p>
		} @else if (photo) {
			<section class="review" aria-label="Review photo">
				<img src={photo.url} alt="Photo to review" />
				<button
					onClick={() => {
						photo = null;
						ready = false;
					}}
				>
					Close
				</button>
			</section>
		} @else {
			<div>
				<device.camera el={cam} onReady={() => (ready = true)} onDenied={() => (denied = true)} />
				<button disabled={!ready} onClick={async () => { if (cam) photo = await cam.takePhoto(); }}>Take photo</button>
			</div>
		}
	</section>
}
```

### Task 5: voice memo
```tsrx
// file: task5/Memo.tsrx
import { state } from '@markless/core';
import { device, type Clip } from '@markless/device';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clip = state<Clip | null>(null);
	let denied = state(false);

	<section>
		<device.recorder
			active={recording}
			onTick={(whole) => (seconds = whole)}
			onChange={(next) => (clip = next)}
			onDenied={() => {
				denied = true;
				recording = false;
			}}
		/>
		<button
			disabled={denied}
			onClick={() => {
				if (!recording) seconds = 0;
				recording = !recording;
			}}
		>{recording ? 'Stop' : 'Record'}</button>
		@if (recording) {
			<p>{`${seconds} s`}</p>
		}
		@if (denied) {
			<p>Microphone access is off.</p>
		}
		@if (clip) {
			<audio controls src={clip.url} />
		}
	</section>
}
```

### Task 6: map with pins, "Recenter on me", and a separate search page
```ts
// file: task6/places.ts
import type { Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export function placeFrom(search: string): Place | null {
	const query = new URLSearchParams(search);
	const latitude = query.get('lat');
	const longitude = query.get('lng');
	return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { device, type Place } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	let center = state<Place>(placeFrom(url.search) ?? spots[0].at);
	let chosen = state<Spot | null>(null);
	let denied = state(false);

	<main>
		<device.map center={center} zoom={13} onChange={(next) => (center = next)}>
			@for (const spot of spots; key spot.name) {
				<device.map.pin at={spot.at} onPress={() => (chosen = spot)} />
			}
		</device.map>
		<button
			onClick={async () => {
				try {
					center = await device.location.current();
				} catch (error) {
					denied = (error as Error).name === 'NotAllowedError';
				}
			}}
		>
			Recenter on me
		</button>
		@if (denied) {
			<p>Location access is off.</p>
		}
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button onClick={() => navigate(`/map?lat=${spot.at.latitude}&lng=${spot.at.longitude}`)}>{spot.name}</button>
				</li>
			}
		</ul>
	</main>
}
```

=== END DESIGN KJ ===

=== DESIGN ZK ===
### Task 1: camera screen
```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (!cam.denied) {
			<camera el={cam} />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
			<button onClick={() => openSettings()}>Open Settings</button>
		</camera.error>
		<camera.trigger of={cam} onPhoto={(next) => (photo = next)}>Take photo</camera.trigger>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 3: one camera shows the picture and reports QR codes
```tsrx
// file: task3/Scanner.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Scanner() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let code = state('');
	cam.scan((text) => {
		if (text !== code) code = text;
	});

	<section>
		@if (!cam.denied) {
			<camera el={cam} />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger of={cam} onPhoto={(next) => (photo = next)}>Take photo</camera.trigger>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
```tsrx
// file: task4/Review.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Review() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	// Relies on the camera's `active` field: false releases the camera while the panel shows, true starts it again.
	<section>
		@if (!cam.denied) {
			<camera el={cam} />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger
			of={cam}
			onPhoto={(next) => {
				photo = next;
				cam.active = false;
			}}
		>
			Take photo
		</camera.trigger>
		@if (photo) {
			<section class="review" aria-label="Review photo">
				<img src={photo.url} alt="Photo to review" />
				<button
					onClick={() => {
						photo = null;
						cam.active = true;
					}}
				>
					Close
				</button>
			</section>
		}
	</section>
}
```

### Task 5: voice memo
```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		<recorder.trigger of={rec}>{rec.recording ? 'Stop' : 'Record'}</recorder.trigger>
		@if (rec.recording) {
			<p>
				<recorder.label of={rec} /> s
			</p>
		}
		@if (rec.denied) {
			<p>Microphone access is off.</p>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```

### Task 6: map with pins, "Recenter on me", and a separate search page
```ts
// file: task6/places.ts
import type { Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export function placeFrom(search: string): Place | null {
	const query = new URLSearchParams(search);
	const latitude = query.get('lat');
	const longitude = query.get('lng');
	return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { mapview } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	const map = mapview({ center: placeFrom(url.search) ?? spots[0].at, zoom: 13 });
	let chosen = state<Spot | null>(null);

	<main>
		<mapview el={map}>
			@for (const spot of spots; key spot.name) {
				<map.pin at={spot.at} onPress={() => (chosen = spot)} />
			}
		</mapview>
		<mapview.trigger of={map}>Recenter on me</mapview.trigger>
		@if (map.denied) {
			<p>Location access is off.</p>
		}
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button onClick={() => navigate(`/map?lat=${spot.at.latitude}&lng=${spot.at.longitude}`)}>{spot.name}</button>
				</li>
			}
		</ul>
	</main>
}
```

=== END DESIGN ZK ===

=== DESIGN DU ===
### Task 1: camera screen
```tsrx
// file: task1/Shooter.tsrx
import { element, state } from '@markless/core';
import { Camera, openSettings, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let camera = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let refused = state(false);

	<section>
		@if (refused) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<Camera
				el={camera}
				facing={facing}
				onReady={() => (ready = true)}
				onChange={(next) => (photo = next)}
				onError={(error) => (refused = error.name === 'NotAllowedError')}
			/>
		}
		<button disabled={!ready} onClick={() => camera?.capture()}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 3: one camera shows the picture and reports QR codes
```tsrx
// file: task3/Scanner.tsrx
import { element, state } from '@markless/core';
import { Camera, type CameraElement, type Photo } from '@markless/device';

export default function Scanner() @{
	let camera = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let refused = state(false);
	let code = state('');

	<section>
		@if (refused) {
			<p>Camera access is off.</p>
		} @else {
			<Camera
				el={camera}
				scan
				onReady={() => (ready = true)}
				onChange={(next) => (photo = next)}
				onCode={(text) => {
					if (text !== code) code = text;
				}}
				onError={(error) => (refused = error.name === 'NotAllowedError')}
			/>
		}
		<button disabled={!ready} onClick={() => camera?.capture()}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
```tsrx
// file: task4/Review.tsrx
import { element, state } from '@markless/core';
import { Camera, type CameraElement, type Photo } from '@markless/device';

export default function Review() @{
	let camera = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let refused = state(false);

	// Relies on the camera running only while <Camera> is in the page: the @if removes it while the panel shows.
	<section>
		@if (refused) {
			<p>Camera access is off.</p>
		} @else if (photo) {
			<section class="review" aria-label="Review photo">
				<img src={photo.url} alt="Photo to review" />
				<button
					onClick={() => {
						photo = null;
						ready = false;
					}}
				>
					Close
				</button>
			</section>
		} @else {
			<div>
				<Camera
					el={camera}
					onReady={() => (ready = true)}
					onChange={(next) => (photo = next)}
					onError={(error) => (refused = error.name === 'NotAllowedError')}
				/>
				<button disabled={!ready} onClick={() => camera?.capture()}>Take photo</button>
			</div>
		}
	</section>
}
```

### Task 5: voice memo
```tsrx
// file: task5/Memo.tsrx
import { state } from '@markless/core';
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();
	let refused = state(false);

	<section>
		<button
			onClick={() => {
				if (rec.recording) rec.stop();
				else rec.start().catch((error: Error) => (refused = error.name === 'NotAllowedError'));
			}}
		>
			{rec.recording ? 'Stop' : 'Record'}
		</button>
		@if (rec.recording) {
			<p>{`${rec.elapsed} s`}</p>
		}
		@if (refused) {
			<p>Microphone access is off.</p>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```

### Task 6: map with pins, "Recenter on me", and a separate search page
```ts
// file: task6/places.ts
import type { Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export function placeFrom(search: string): Place | null {
	const query = new URLSearchParams(search);
	const latitude = query.get('lat');
	const longitude = query.get('lng');
	return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
```

```tsrx
// file: task6/MapPage.tsrx
import { element, state } from '@markless/core';
import { MapView, type MapElement } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	let view = element<MapElement>();
	let chosen = state<Spot | null>(null);
	let refused = state(false);

	<main>
		<MapView
			el={view}
			center={placeFrom(url.search) ?? spots[0].at}
			zoom={13}
			pins={spots.map((spot) => spot.at)}
			onPin={(index) => (chosen = spots[index])}
			onError={(error) => (refused = error.name === 'NotAllowedError')}
		/>
		<button onClick={() => view?.locate()}>Recenter on me</button>
		@if (refused) {
			<p>Location access is off.</p>
		}
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button onClick={() => navigate(`/map?lat=${spot.at.latitude}&lng=${spot.at.longitude}`)}>{spot.name}</button>
				</li>
			}
		</ul>
	</main>
}
```

=== END DESIGN DU ===

=== DESIGN WZ ===
### Task 1: camera screen
```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);

	<camera.root facing={facing} onCapture={(next) => (photo = next)}>
		<camera.area />
		<camera.error>
			<p>Camera access is off.</p>
			<button onClick={() => openSettings()}>Open Settings</button>
		</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```

### Task 3: one camera shows the picture and reports QR codes
```tsrx
// file: task3/Scanner.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Scanner() @{
	let photo = state<Photo | null>(null);
	let code = state('');

	<camera.root
		scan
		onCapture={(next) => (photo = next)}
		onCode={(text) => {
			if (text !== code) code = text;
		}}
	>
		<camera.area />
		<camera.error>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```

### Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
```tsrx
// file: task4/Review.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Review() @{
	let photo = state<Photo | null>(null);

	// Relies on the root's `active` setting: active={false} releases the camera while the panel shows, true starts it again.
	<camera.root active={photo === null} onCapture={(next) => (photo = next)}>
		<camera.area />
		<camera.error>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		@if (photo) {
			<section class="review" aria-label="Review photo">
				<img src={photo.url} alt="Photo to review" />
				<button onClick={() => (photo = null)}>Close</button>
			</section>
		}
	</camera.root>
}
```

### Task 5: voice memo
```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder.handle();

	<recorder.root handle={rec}>
		<recorder.trigger>{rec.recording ? 'Stop' : 'Record'}</recorder.trigger>
		@if (rec.recording) {
			<p>
				<recorder.label /> s
			</p>
		}
		<recorder.error>
			<p>Microphone access is off.</p>
		</recorder.error>
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</recorder.root>
}
```

### Task 6: map with pins, "Recenter on me", and a separate search page
```ts
// file: task6/places.ts
import { map, type Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export const cityMap = map.handle();
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { map } from '@markless/device';
import { cityMap, spots, type Spot } from './places.ts';

export default function MapPage() @{
	let chosen = state<Spot | null>(null);

	<main>
		<map.root handle={cityMap} center={spots[0].at} zoom={13}>
			<map.area>
				@for (const spot of spots; key spot.name) {
					<map.item at={spot.at} onSelect={() => (chosen = spot)} />
				}
			</map.area>
			<map.trigger>Recenter on me</map.trigger>
			<map.error>
				<p>Location access is off.</p>
			</map.error>
		</map.root>
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { cityMap, spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button
						onClick={async () => {
							cityMap.moveTo(spot.at);
							await navigate('/map');
						}}
					>
						{spot.name}
					</button>
				</li>
			}
		</ul>
	</main>
}
```

=== END DESIGN WZ ===

=== DESIGN JR ===
### Task 1: camera screen
```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (cam.denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 3: one camera shows the picture and reports QR codes
```tsrx
// file: task3/Scanner.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Scanner() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let code = state('');
	cam.scan((text) => {
		if (text !== code) code = text;
	});

	<section>
		@if (cam.denied) {
			<p>Camera access is off.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

### Task 4: "Review photo" panel covers the camera; the camera must stop meanwhile
```tsrx
// file: task4/Review.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Review() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	// Relies on the camera's `active` field: false releases the camera while the panel shows, true starts it again.
	<section>
		@if (cam.denied) {
			<p>Camera access is off.</p>
		} @else {
			<camera el={cam} />
		}
		<button
			disabled={!cam.ready}
			onClick={async () => {
				photo = await cam.takePhoto();
				cam.active = false;
			}}
		>
			Take photo
		</button>
		@if (photo) {
			<section class="review" aria-label="Review photo">
				<img src={photo.url} alt="Photo to review" />
				<button
					onClick={() => {
						photo = null;
						cam.active = true;
					}}
				>
					Close
				</button>
			</section>
		}
	</section>
}
```

### Task 5: voice memo
```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		<button
			onClick={() => {
				if (rec.recording) rec.stop();
				else void rec.start();
			}}
		>
			{rec.recording ? 'Stop' : 'Record'}
		</button>
		@if (rec.recording) {
			<p>{`${rec.seconds} s`}</p>
		}
		@if (rec.denied) {
			<p>Microphone access is off.</p>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```

### Task 6: map with pins, "Recenter on me", and a separate search page
```ts
// file: task6/places.ts
import type { Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export function placeFrom(search: string): Place | null {
	const query = new URLSearchParams(search);
	const latitude = query.get('lat');
	const longitude = query.get('lng');
	return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { mapview } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	const map = mapview({ center: placeFrom(url.search) ?? spots[0].at, zoom: 13 });
	let chosen = state<Spot | null>(null);

	<main>
		<mapview el={map}>
			@for (const spot of spots; key spot.name) {
				<map.pin at={spot.at} onPress={() => (chosen = spot)} />
			}
		</mapview>
		<button onClick={() => map.locate()}>Recenter on me</button>
		@if (map.denied) {
			<p>Location access is off.</p>
		}
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button onClick={() => navigate(`/map?lat=${spot.at.latitude}&lng=${spot.at.longitude}`)}>{spot.name}</button>
				</li>
			}
		</ul>
	</main>
}
```

=== END DESIGN JR ===

For each design, answer these questions from the code alone. If the code does not show the answer, say so rather than guess.

- Q1 (task 1). If the person refuses camera access, what do they see on screen?
- Q2 (task 1). What happens if the person presses the shutter before the camera is ready?
- Q3 (task 1). Is the camera view one element on screen, or several elements working together?
- Q4 (task 3). How does the code hear about QR codes, and how are repeats ignored?
- Q5 (task 4). When exactly is the camera released (switched off), and what turns it back on?
- Q6 (task 5). What starts and stops the recording, and is anything on screen for the recorder itself?
- Q7 (task 6). How does choosing a result on the search page move the map?
- Q8 (task 6). What does "Recenter on me" do?

Then rank the five designs from clearest (1) to least clear (5) for someone who has to maintain this code, with one or two sentences of reason each. Finally, say whether anything in any design confused you (for example, an element that shows nothing on screen, or where a tag comes from), quoting the line.

Output format: a heading `## Design XX` per design with lines `Q1:` … `Q8:`; then `## Ranking` with lines `1. XX — reason` … `5. XX — reason`; then `## Confusions`; end with `Tools used: none`.