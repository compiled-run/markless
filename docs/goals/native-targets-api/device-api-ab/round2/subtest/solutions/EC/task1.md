```tsrx
// file: task1/Snap.tsrx
import { state } from '@markless/core';
import { camera, type Photo } from '@markless/device';

export default function Snap() @{
	let photo = state<Photo | null>(null);

	<section>
		<button onClick={async () => { photo = (await camera.takePhoto()) ?? photo; }}>Take a photo</button>
		@if (photo) {
			<img src={photo.url} alt="Photo taken" />
		}
	</section>
}
```
