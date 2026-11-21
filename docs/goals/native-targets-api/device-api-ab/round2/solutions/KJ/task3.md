```tsrx
// file: task3/Scanner.tsrx
import { element, state } from '@markless/core';
import { device, type CameraElement, type Photo } from '@markless/device';

export default function Scanner() @{
	let cam = element<CameraElement>();
	let photo = state<Photo | null>(null);
	let ready = state(false);
	let denied = state(false);
	let code = state('');

	<section>
		@if (denied) {
			<p>Camera access is off.</p>
		} @else {
			<device.camera
				el={cam}
				scan={['qr']}
				onScan={(text) => {
					if (text !== code) code = text;
				}}
				onReady={() => (ready = true)}
				onDenied={() => (denied = true)}
			/>
		}
		<button disabled={!ready} onClick={async () => { if (cam) photo = await cam.takePhoto(); }}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
