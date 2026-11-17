```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (cam.denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
