```tsrx
import { element, state } from '@markless/core';
import { CameraView, cameraPermission, type CameraViewElement, type Picture } from '@markless/device';

export default function Shooter() @{
	const permission = cameraPermission();
	let cam = element<CameraViewElement>();
	let facing = state<'front' | 'back'>('back');
	let photo = state<Picture | null>(null);

	<section>
		@if (permission.state === 'granted') {
			<div>
				<CameraView el={cam} facing={facing} />
				<button onClick={async () => { if (cam) photo = await cam.takePicture(); }}>Take photo</button>
				<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
			</div>
		} @else {
			<div>
				@if (permission.state === 'denied') {
					<p>Camera access is off. Allow it in Settings to take photos.</p>
				} @else {
					<button onClick={() => permission.request()}>Allow camera</button>
				}
			</div>
		}
		@if (photo) {
			<img src={photo.uri} alt="Last photo" />
		}
	</section>
}
```
