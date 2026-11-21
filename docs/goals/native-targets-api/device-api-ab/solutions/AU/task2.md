```tsrx
import { computed, state } from '@markless/core';
import { getUserMedia, MediaView, takePhoto } from '@markless/device';

export default function Shooter() @{
	let facingMode = state<'user' | 'environment'>('environment');
	let photoUrl = state('');
	const stream = computed(async () => await getUserMedia({ video: { facingMode } }));

	<section>
		@try {
			<>
				<MediaView srcObject={stream} />
				<button onClick={async () => { photoUrl = URL.createObjectURL(await takePhoto(stream.getVideoTracks()[0])); }}>Take photo</button>
			</>
		} @pending {
			<p>Starting camera…</p>
		} @catch (error) {
			<p>{error.name === 'NotAllowedError' ? 'Camera access is off. Allow it in Settings to take photos.' : error.message}</p>
		}
		<button onClick={() => (facingMode = facingMode === 'user' ? 'environment' : 'user')}>Switch camera</button>
		@if (photoUrl) {
			<img src={photoUrl} alt="Last photo" />
		}
	</section>
}
```
Config: `grants` includes `'camera'` in `markless.config.ts`, with its usage text under `"camera"` in `strings/permissions.json`.
