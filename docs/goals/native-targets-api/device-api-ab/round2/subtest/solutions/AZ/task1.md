```tsrx
// file: task1/Snap.tsrx
import { state } from '@markless/core';
import { takePhoto, type Photo } from '@markless/device';

export default function Snap() @{
	let photo = state<Photo | null>(null);

	<section>
		<button onClick={async () => { photo = (await takePhoto()) ?? photo; }}>Take a photo</button>
		@if (photo) {
			<img src={photo.url} alt="Photo taken" />
		}
	</section>
}
```
