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
