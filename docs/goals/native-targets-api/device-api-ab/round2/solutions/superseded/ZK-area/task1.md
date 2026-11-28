```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Photo } from '@markless/device';

export default function Shooter() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<section>
		@if (!cam.denied) {
			<cam.area />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
			<button onClick={() => openSettings()}>Open Settings</button>
		</camera.error>
		<camera.trigger of={cam} onCapture={(next) => (photo = next)}>Take photo</camera.trigger>
		<button onClick={() => { cam.facing = cam.facing === 'back' ? 'front' : 'back'; }}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
