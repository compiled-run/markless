```tsrx
// file: task1/Shooter.tsrx
import { element, state } from '@markless/core';
import { Camera, openSettings, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let camera = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let refused = state(false);

	<section>
		@if (refused) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<Camera
				el={camera}
				facing={facing}
				onReady={() => (ready = true)}
				onChange={(next) => (photo = next)}
				onError={(error) => (refused = error.name === 'NotAllowedError')}
			/>
		}
		<button disabled={!ready} onClick={() => camera?.capture()}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
