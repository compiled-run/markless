```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraApp, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	async function shoot() {
		try {
			photo = await cam.takePhoto();
			message = '';
		} catch (error) {
			message = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
		}
	}

	async function usePhoneCamera() {
		const taken = await cameraApp.open();
		if (taken) photo = taken;
	}

	async function choosePhoto() {
		const chosen = await photoLibrary.open();
		if (chosen) photo = chosen;
	}

	async function share() {
		if (photo) await sharesheet.open({ url: photo.url });
	}

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
		<button onClick={usePhoneCamera}>Use phone camera</button>
		<button onClick={choosePhoto}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (message) {
			<p>{message}</p>
		}
		@if (photo) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={share}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- I assumed `@if` narrows `photo` so `photo.url` type-checks inside the block, and that reading `photo` inside the `share` handler gives the current value.
- I assumed it is fine for handlers to be `async` functions declared in the body, using ordinary try/catch.
- I disabled the shutter button until `cam.ready` is true, even though `takePhoto()` already waits until the camera is ready.
- I assumed `cameraApp.open()` and `photoLibrary.open()` need no permission handling beyond treating `null` as "the person cancelled".
- I assumed `{ facing: 'back' }` is a sensible default camera.

## Calls
- `cam.takePhoto()` (where `cam = camera()`)
- `cameraApp.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instructions file only)
