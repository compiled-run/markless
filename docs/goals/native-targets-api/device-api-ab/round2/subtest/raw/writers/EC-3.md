## Task 1
```tsrx
// file: task1/SystemPhoto.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

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
	const position = computed(async () => await location.current());

	<section>
		@try {
			<p>
				{position.latitude}, {position.longitude} (±{position.accuracy} m)
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
	const m = mapview({ zoom: 15 });

	<div>
		<mapview el={m}>
			@if (live.position) {
				<m.pin at={{ latitude: live.position.latitude, longitude: live.position.longitude }} />
			}
		</mapview>
		@if (live.denied) {
			<p>Location access was refused.</p>
		}
	</div>
}
```
Confidence: 3/5

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
// file: task7/CameraScreen.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function CameraScreen() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<div>
		@if (cam.denied) {
			<p>Camera access was refused.</p>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Shutter</button>
		<button
			onClick={async () => {
				const taken = await camera.takePhoto();
				if (taken) photo = taken;
			}}
		>
			Use system camera
		</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</div>
}
```
Confidence: 3/5

## Guesses
- I assumed a handler can be `async`, and that assigning state after an `await` updates the page.
- Task 2: I assumed `reset` in `@catch` runs the async computed again, so "Try again" asks for the location again. I also assumed `error.name` can be read in `@catch` markup (inside `@if`), since the guidance says it survives. I showed the Open Settings and Try again buttons for every error, not only for a refused permission.
- Task 3: I assumed the pin is written as `<m.pin at={...} />` (a component taken from the map object), and that it moves when `live.position` changes. I did not keep the map centred on the person, because the sheet only lets you move the map by assigning `center`, and without effects there was no clear place to do that. The zoom level of 15 is my choice.
- Task 3 and Task 7: I assumed the lowercase `<camera>` and `<mapview>` tags are separate from the imported `camera` and `mapview` functions with the same names.
- Task 7: I hid the `<camera>` element when access is refused. I also assumed `disabled={!cam.ready}` updates live as the camera starts.
- Task 6: The notification title and body text are my own.
- Task 4: I assumed the article's title and url come in as props.

Tools used: none