```tsrx
import { state } from '@markless/core';
import { showCapturePicker } from '@markless/device';

export default function Snap() @{
	let photoUrl = state('');

	<section>
		<button
			onClick={async () => {
				const file = await showCapturePicker({ accept: 'image/*', capture: 'environment' });
				if (file) photoUrl = URL.createObjectURL(file);
			}}
		>
			Take photo
		</button>
		@if (photoUrl) {
			<img src={photoUrl} alt="Photo you took" />
		}
	</section>
}
```
Config: `grants` includes `'camera'` in `markless.config.ts`, with its usage text under `"camera"` in `strings/permissions.json`.
