```tsrx
// file: task3/Scanner.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Scanner() @{
	let photo = state<Photo | null>(null);
	let code = state('');

	<camera.root
		scan
		onCapture={(next) => (photo = next)}
		onCode={(text) => {
			if (text !== code) code = text;
		}}
	>
		<camera.area />
		<camera.error>
			<p>Camera access is off.</p>
		</camera.error>
		<camera.trigger>Take photo</camera.trigger>
		@if (code) {
			<p>{`Last code: ${code}`}</p>
		}
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</camera.root>
}
```
