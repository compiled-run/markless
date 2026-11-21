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
