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
		@if (!cam.denied) {
			<cam.area />
		}
		<camera.error of={cam}>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger of={cam} onCapture={(next) => (photo = next)}>Take photo</camera.trigger>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}
```
