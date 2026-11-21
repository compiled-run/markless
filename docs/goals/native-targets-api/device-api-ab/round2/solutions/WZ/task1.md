```tsrx
// file: task1/Shooter.tsrx
import { state } from '@markless/core';
import { camera, openSettings, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);

	<camera.root facing={facing} onCapture={(next) => (photo = next)}>
		<camera.area />
		<camera.error>
			<p>Camera access is off.</p>
			<button onClick={() => openSettings()}>Open Settings</button>
		</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```
