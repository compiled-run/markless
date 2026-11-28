## Task 1

```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';

export default function SystemPhoto() @{
	let photo = state<Photo | null>(null);

	<div>
		<button
			onClick={async () => {
				const taken = await camera.takePhoto();
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
import { location, openSettings } from '@markless/device';

export default function CurrentLocation() @{
	const here = computed(async () => await location.current());

	<section>
		@try {
			<p>
				{here.latitude}, {here.longitude} (within {here.accuracy} m)
			</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				@if (error.name === 'NotAllowedError') {
					<p>Location access was refused.</p>
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
import { location, mapview } from '@markless/device';

export default function LiveMap() @{
	const live = location();
	const map = mapview({ zoom: 15 });

	<div>
		<mapview el={map}>
			@if (live.position) {
				<map.pin at={{ latitude: live.position.latitude, longitude: live.position.longitude }} />
			}
		</mapview>
		@if (live.denied) {
			<p>Location access was refused.</p>
		}
	</div>
}
```

Confidence: 2/5

## Task 4

```tsrx
// file: task4/ShareArticle.tsrx
import { share } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	<button onClick={() => share({ title, url })}>Share</button>
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
		Like ({likes})
	</button>
}
```

Confidence: 5/5

## Task 6

```tsrx
// file: task6/OrderReminder.tsrx
import { notifications } from '@markless/device';

export default function OrderReminder() @{
	<button
		onClick={() =>
			notifications.schedule({
				title: 'Order 42',
				body: 'Check on your order.',
				at: new Date(Date.now() + 60 * 60 * 1000),
				url: '/orders/42',
			})
		}
	>
		Remind me in an hour
	</button>
}
```

Confidence: 4/5

## Task 7

```tsrx
// file: task7/DualCamera.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import type { Photo } from '@markless/device';

export default function DualCamera() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>
			Shutter
		</button>
		<button
			onClick={async () => {
				const taken = await camera.takePhoto();
				if (taken) photo = taken;
			}}
		>
			Use system camera
		</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo taken" />
		}
	</div>
}
```

Confidence: 3/5

## Guesses

- **Pin syntax (task 3):** I guessed that a pin is written as `<map.pin at={...} />`, using the map object's `pin` field as a tag. The sheet only says a pin is "written inside `<mapview el={m}>`".

- **Map center (task 3):** I left the map center unset. I guessed the map either follows its pins or starts somewhere sensible. Nothing says the center follows the person, and with no effects there is no obvious place to assign `center` when the position changes.

- **Try again (task 2):** I guessed that `reset` in `@catch` runs the async computed again, so `location.current()` gets called again.

- **Refused access (task 2):** I guessed that the refusal error reaches `@catch` with `error.name === 'NotAllowedError'` intact. The guidance says `name` survives. I also guessed that `@if`/`@else` can go inside `@catch`.

- **Async handlers (tasks 1 and 7):** I guessed that a handler can be async and can assign state after an `await`.

- **Camera element (task 7):** I guessed that `<camera>` is an intrinsic tag and does not clash with the imported `camera` function. I also guessed that hiding the element when `denied` is true is acceptable, and that `disabled={!cam.ready}` is a valid reactive attribute.

- **Haptic kind (task 5):** I picked `'light'`. The task doesn't say which kind.

- **Task 4 props:** I passed the article's title and url in as props. The task doesn't say where they come from.

- **Task 6 trigger and text:** I added a button to trigger the scheduling. The notification's title and body text are mine.

Tools used: none