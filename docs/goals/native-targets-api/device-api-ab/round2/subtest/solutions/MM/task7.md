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
