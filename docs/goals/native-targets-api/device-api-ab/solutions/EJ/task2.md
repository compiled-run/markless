```tsrx
import { element, state } from '@markless/core';
import { Camera, type CameraElement, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let camera = element<CameraElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let refused = state(false);

	<section>
		@if (refused) {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<Camera el={camera} facing={facing} onChange={(next) => (photo = next)} onError={(error) => (refused = error.name === 'NotAllowedError')} />
		}
		<button onClick={() => camera?.capture()}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
