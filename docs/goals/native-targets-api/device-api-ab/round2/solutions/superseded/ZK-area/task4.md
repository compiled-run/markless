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
			<cam.area />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger
			of={cam}
			onCapture={(next) => {
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
