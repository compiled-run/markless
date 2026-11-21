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
			<cam.area />
		}
		<button
			disabled={!cam.ready}
			onClick={async () => {
				photo = await cam.capture();
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
