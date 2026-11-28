```tsrx
// file: task1/Shooter.tsrx
import { element, state } from '@markless/core';
import { device, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let cam = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let denied = state(false);

	<section>
		@if (denied) {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => device.openSettings()}>Open Settings</button>
			</div>
		} @else {
			<device.camera el={cam} facing={facing} onReady={() => (ready = true)} onDenied={() => (denied = true)} />
		}
		<button disabled={!ready} onClick={async () => { if (cam) photo = await cam.takePhoto(); }}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Flip camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
