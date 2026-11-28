```tsx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, systemCamera, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let problem = state<string | null>(null);

	const run = async (action: () => Promise<Photo | null>) => {
		problem = null;
		try {
			const taken = await action();
			if (taken) photo = taken;
		} catch (error) {
			const e = error as Error;
			problem = e.name === 'NotAllowedError' ? 'Camera access was refused.' : e.message;
		}
	};

	<main>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Shutter</button>
		<button onClick={() => run(() => systemCamera.open())}>Use phone camera</button>
		<button onClick={() => run(() => photoLibrary.open())}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (problem !== null) {
			<p>{problem}</p>
		}
		@if (photo !== null) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={() => sharesheet.open({ url: photo!.url })}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- The sheet doesn't show whether `base` is a named export of `@markless/ui`, so I imported it that way.
- I assumed a `state` value can be read and assigned inside async handlers and inside a helper closure (`run`), and that narrowing `photo` in `@if` carries into JSX, with `photo!` added in the handler to be safe.
- I disabled the shutter until `cam.ready`, even though `takePhoto()` already waits for the camera to be ready.
- I assumed refusing the camera permission makes `takePhoto()` reject with `NotAllowedError` and also sets `cam.access` to `'denied'`, so the Settings button shows.
- I chose `facing: 'back'`; the task didn't specify which camera to use.
- I don't add `.catch` to `sharesheet.open`, on the assumption that it only resolves when the panel closes.

## Calls
- `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- `systemCamera.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
