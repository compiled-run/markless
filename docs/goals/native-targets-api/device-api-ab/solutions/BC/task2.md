```tsrx
import { element, state } from '@markless/core';
import { cameraPreview, capturePhoto, type Facing, type Photo } from '@markless/device';

export default function Shooter() @{
	let video = element<HTMLVideoElement>();
	let facing = state<Facing>('back');
	let photo = state<Photo | null>(null);
	let refused = state(false);

	<section>
		@if (refused) {
			<p>Camera access is off. Allow it in Settings to take photos.</p>
		} @else {
			<video el={video} autoplay playsinline muted attach={cameraPreview({ facing, onError: (error) => (refused = error.name === 'NotAllowedError') })} />
		}
		<button onClick={async () => { photo = await capturePhoto(video); }}>Take photo</button>
		<button onClick={() => (facing = facing === 'back' ? 'front' : 'back')}>Switch camera</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
