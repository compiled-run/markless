```tsrx
import { state } from '@markless/core';
import { camera, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);

	<camera.root facing={facing} onChange={(next: Photo) => (photo = next)}>
		<camera.area />
		<camera.error>Camera access is off. Allow it in Settings to take photos.</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```
