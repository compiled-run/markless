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
