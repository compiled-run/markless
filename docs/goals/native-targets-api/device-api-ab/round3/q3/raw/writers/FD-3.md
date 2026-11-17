```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, choosePhoto, openSettings, openShareSheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	const shoot = async () => {
		try {
			photo = await cam.takePhoto();
			message = '';
		} catch (error) {
			message = (error as Error).message;
		}
	};

	const usePhoneCamera = async () => {
		try {
			const taken = await camera.takePhoto();
			if (taken) photo = taken;
		} catch (error) {
			message = (error as Error).message;
		}
	};

	const pickPhoto = async () => {
		try {
			const chosen = await choosePhoto();
			if (chosen) photo = chosen;
		} catch (error) {
			message = (error as Error).message;
		}
	};

	const share = async () => {
		if (photo) await openShareSheet({ url: photo.url });
	};

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
		<button onClick={usePhoneCamera}>Use phone camera</button>
		<button onClick={pickPhoto}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message) {
			<p>{message}</p>
		}
		@if (photo) {
			<>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={share}>Share</button>
			</>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- I guessed that `Photo` can be imported as a type from `@markless/device`, since the sheet exports it.
- I guessed that a module-level `async` arrow function declared in the body works as an `onClick` handler, and that assigning to state after an `await` updates the page.
- I guessed that `disabled={!cam.ready}` stays live. It is optional anyway, because `takePhoto()` already waits until the camera is ready.
- I guessed that narrowing `photo` with `@if (photo)` lets me read `photo.url` inside that block.
- I guessed that a user cancelling (a `null` result) should leave the previous photo in place.
- I guessed the error handling: a refused permission (`NotAllowedError`) or any other failure shows its message in a `<p>`.

## Calls
- In-page camera photo: `cam.takePhoto()`, where `cam = camera({ facing: 'back' })`
- Phone's camera screen: `camera.takePhoto()`
- Photo library: `choosePhoto()`

Tools used: Read (once, only to read the instructions file as directed; no tools were used to write the answer)
