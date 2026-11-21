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
