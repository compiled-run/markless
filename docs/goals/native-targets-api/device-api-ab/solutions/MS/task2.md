```tsrx
import { state } from '@markless/core';
import { camera, Preview, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (cam.status === 'denied') {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<Preview of={cam} />
		}
		<button onClick={async () => { photo = await cam.capture(); }}>Take photo</button>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
