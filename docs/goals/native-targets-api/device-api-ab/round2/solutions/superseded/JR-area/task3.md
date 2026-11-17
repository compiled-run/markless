```tsrx
// file: task3/Scanner.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Scanner() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let code = state('');
	cam.scan((text) => {
		if (text !== code) code = text;
	});

	<section>
		@if (cam.denied) {
			<p>Camera access is off.</p>
		} @else {
			<cam.area />
		}
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.capture(); }}>Take photo</button>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
