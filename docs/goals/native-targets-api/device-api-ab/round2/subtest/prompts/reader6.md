You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Below is code for the same seven small tasks written three ways, one per variant of a phone device API (`@markless/device`) for Markless, a UI framework whose components are written in `.tsrx` files. Each variant has a two-letter label. You get the code only, no documentation. In `.tsrx`, a component body is `@{ statements; one root element }`, runs once, and `state()` values update the page when assigned; `@try`/`@pending`/`@catch`, `@if` and `@for` are template blocks; `<camera el={cam} />` shows a camera made in the component.

=== VARIANT AZ ===
### Task 1: button opens the phone's own camera screen, shows the photo
```tsrx
// file: task1/Snap.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function Snap() @{
	let photo = state<Photo | null>(null);

	<section>
		<button onClick={async () => { photo = (await takePhoto()) ?? photo; }}>Take a photo</button>
		@if (photo) {
			<img src={photo.url} alt="Photo taken" />
		}
	</section>
}
```

### Task 2: current location as text, read once, with refused state
```tsrx
// file: task2/Here.tsrx
import { computed, state } from '@markless/core';
import { currentPosition, openSettings } from '@markless/device';

export default function Here() @{
	let attempt = state(0);
	const where = computed(async () => {
		attempt;
		return await currentPosition();
	});

	<section>
		@try {
			<p>{`${where.latitude.toFixed(4)}, ${where.longitude.toFixed(4)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>Location access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

### Task 3: live position as a pin on a map
```tsrx
// file: task3/LiveMap.tsrx
import { mapview, watchLocation } from '@markless/device';

export default function LiveMap() @{
	const me = watchLocation();
	const map = mapview({ zoom: 15 });

	<section>
		<mapview el={map}>
			@if (me.position) {
				<map.pin at={me.position} />
			}
		</mapview>
		@if (me.denied) {
			<p>Location access is off.</p>
		}
	</section>
}
```

### Task 4: share button
```tsrx
// file: task4/ShareButton.tsrx
import { share } from '@markless/device';

export default function ShareButton({ title, url }: { title: string; url: string }) @{
	<button onClick={() => share({ title, url })}>Share</button>
}
```

### Task 5: like button with a haptic tap
```tsrx
// file: task5/Like.tsrx
import { state } from '@markless/core';
import { haptic } from '@markless/device';

export default function Like() @{
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			haptic('light');
		}}
	>
		{`Like (${likes})`}
	</button>
}
```

### Task 6: scheduled notification for an order
```tsrx
// file: task6/Remind.tsrx
import { notify } from '@markless/device';

export default function Remind() @{
	<button onClick={() => notify({ title: 'Your order', body: 'Order 42 is ready.', at: new Date(Date.now() + 60 * 60 * 1000), url: '/orders/42' })}>
		Remind me in an hour
	</button>
}
```

### Task 7: in-page camera with a shutter, plus a "Use system camera" button
```tsrx
// file: task7/TwoCameras.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, type Photo } from '@markless/device';

export default function TwoCameras() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<section>
		<camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.capture(); }}>Shutter</button>
		<button onClick={async () => { photo = (await takePhoto()) ?? photo; }}>Use system camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

=== END VARIANT AZ ===

=== VARIANT EC ===
### Task 1: button opens the phone's own camera screen, shows the photo
```tsrx
// file: task1/Snap.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Snap() @{
	let photo = state<Photo | null>(null);

	<section>
		<button onClick={async () => { photo = (await camera.takePhoto()) ?? photo; }}>Take a photo</button>
		@if (photo) {
			<img src={photo.url} alt="Photo taken" />
		}
	</section>
}
```

### Task 2: current location as text, read once, with refused state
```tsrx
// file: task2/Here.tsrx
import { computed, state } from '@markless/core';
import { location, openSettings } from '@markless/device';

export default function Here() @{
	let attempt = state(0);
	const where = computed(async () => {
		attempt;
		return await location.current();
	});

	<section>
		@try {
			<p>{`${where.latitude.toFixed(4)}, ${where.longitude.toFixed(4)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>Location access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

### Task 3: live position as a pin on a map
```tsrx
// file: task3/LiveMap.tsrx
import { location, mapview } from '@markless/device';

export default function LiveMap() @{
	const me = location();
	const map = mapview({ zoom: 15 });

	<section>
		<mapview el={map}>
			@if (me.position) {
				<map.pin at={me.position} />
			}
		</mapview>
		@if (me.denied) {
			<p>Location access is off.</p>
		}
	</section>
}
```

### Task 4: share button
```tsrx
// file: task4/ShareButton.tsrx
import { share } from '@markless/device';

export default function ShareButton({ title, url }: { title: string; url: string }) @{
	<button onClick={() => share({ title, url })}>Share</button>
}
```

### Task 5: like button with a haptic tap
```tsrx
// file: task5/Like.tsrx
import { state } from '@markless/core';
import { haptic } from '@markless/device';

export default function Like() @{
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			haptic('light');
		}}
	>
		{`Like (${likes})`}
	</button>
}
```

### Task 6: scheduled notification for an order
```tsrx
// file: task6/Remind.tsrx
import { notifications } from '@markless/device';

export default function Remind() @{
	<button onClick={() => notifications.schedule({ title: 'Your order', body: 'Order 42 is ready.', at: new Date(Date.now() + 60 * 60 * 1000), url: '/orders/42' })}>
		Remind me in an hour
	</button>
}
```

### Task 7: in-page camera with a shutter, plus a "Use system camera" button
```tsrx
// file: task7/TwoCameras.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function TwoCameras() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<section>
		<camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { photo = (await camera.takePhoto()) ?? photo; }}>Use system camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

=== END VARIANT EC ===

=== VARIANT MM ===
### Task 1: button opens the phone's own camera screen, shows the photo
```tsrx
// file: task1/Snap.tsrx
import { state } from '@markless/core';
import { cameraScreen, type Photo } from '@markless/device';

export default function Snap() @{
	const screen = cameraScreen();
	let photo = state<Photo | null>(null);

	<section>
		<button onClick={async () => { photo = (await screen.open()) ?? photo; }}>Take a photo</button>
		@if (photo) {
			<img src={photo.url} alt="Photo taken" />
		}
	</section>
}
```

### Task 2: current location as text, read once, with refused state
```tsrx
// file: task2/Here.tsrx
import { computed, state } from '@markless/core';
import { location, settings } from '@markless/device';

export default function Here() @{
	const loc = location();
	const app = settings();
	let attempt = state(0);
	const where = computed(async () => {
		attempt;
		return await loc.current();
	});

	<section>
		@try {
			<p>{`${where.latitude.toFixed(4)}, ${where.longitude.toFixed(4)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>Location access is off.</p>
				<button onClick={() => app.open()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```

### Task 3: live position as a pin on a map
```tsrx
// file: task3/LiveMap.tsrx
import { location, mapview } from '@markless/device';

export default function LiveMap() @{
	const me = location();
	const map = mapview({ zoom: 15 });

	<section>
		<mapview el={map}>
			@if (me.position) {
				<map.pin at={me.position} />
			}
		</mapview>
		@if (me.denied) {
			<p>Location access is off.</p>
		}
	</section>
}
```

### Task 4: share button
```tsrx
// file: task4/ShareButton.tsrx
import { sharing } from '@markless/device';

export default function ShareButton({ title, url }: { title: string; url: string }) @{
	const sheet = sharing();

	<button onClick={() => sheet.share({ title, url })}>Share</button>
}
```

### Task 5: like button with a haptic tap
```tsrx
// file: task5/Like.tsrx
import { state } from '@markless/core';
import { haptics } from '@markless/device';

export default function Like() @{
	const buzz = haptics();
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			buzz.tap('light');
		}}
	>
		{`Like (${likes})`}
	</button>
}
```

### Task 6: scheduled notification for an order
```tsrx
// file: task6/Remind.tsrx
import { notifications } from '@markless/device';

export default function Remind() @{
	const notes = notifications();

	<button onClick={() => notes.schedule({ title: 'Your order', body: 'Order 42 is ready.', at: new Date(Date.now() + 60 * 60 * 1000), url: '/orders/42' })}>
		Remind me in an hour
	</button>
}
```

### Task 7: in-page camera with a shutter, plus a "Use system camera" button
```tsrx
// file: task7/TwoCameras.tsrx
import { state } from '@markless/core';
import { camera, cameraScreen, type Photo } from '@markless/device';

export default function TwoCameras() @{
	const cam = camera();
	const screen = cameraScreen();
	let photo = state<Photo | null>(null);

	<section>
		<camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.capture(); }}>Shutter</button>
		<button onClick={async () => { photo = (await screen.open()) ?? photo; }}>Use system camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

=== END VARIANT MM ===

Part 1. For each variant, answer:
- A. In task 7, which call opens the phone's own camera screen, and which call takes a photo from the camera shown on the page? Quote both.
- B. What rule do you think this variant follows for when a feature is an object you make first and when it is a function you call directly?
- C. Did anything in this variant confuse you? Quote the line.

Part 2. Rank the three variants from clearest (1) to least clear (3) for someone maintaining this code, with one sentence of reason each.

Part 3. Here is task 7 from one variant written in two spellings, X and Y. They do the same thing.

Spelling X:
```tsrx
// file: task7/TwoCameras.tsrx
import { state } from '@markless/core';
import { device, type Photo } from '@markless/device';

export default function TwoCameras() @{
	const cam = device.camera();
	let photo = state<Photo | null>(null);

	<section>
		<device.camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { photo = (await device.camera.takePhoto()) ?? photo; }}>Use system camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

Spelling Y:
```tsrx
// file: task7/TwoCameras.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function TwoCameras() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<section>
		<camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { photo = (await camera.takePhoto()) ?? photo; }}>Use system camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```

- D. In the spelling that writes `<camera el={cam} />` as a bare lowercase tag, where do you think the `camera` tag comes from?
- E. Did either spelling confuse you? Quote the part.
- F. Which spelling would you rather write and read, and why?

Output format: headings `## Variant XX` with lines `A:`, `B:`, `C:`; then `## Ranking` with lines `1. XX — reason` … `3. XX — reason`; then `## Spelling` with lines `D:`, `E:`, `F:`; end with `Tools used: none`.