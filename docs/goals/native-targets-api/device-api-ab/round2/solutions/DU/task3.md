```tsrx
// file: task3/Scanner.tsrx
import { element, state } from '@markless/core';
import { Camera, type CameraElement, type Photo } from '@markless/device';

export default function Scanner() @{
	let camera = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let refused = state(false);
	let code = state('');

	<section>
		@if (refused) {
			<p>Camera access is off.</p>
		} @else {
			<Camera
				el={camera}
				scan
				onReady={() => (ready = true)}
				onChange={(next) => (photo = next)}
				onCode={(text) => {
					if (text !== code) code = text;
				}}
				onError={(error) => (refused = error.name === 'NotAllowedError')}
			/>
		}
		<button disabled={!ready} onClick={() => camera?.capture()}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
