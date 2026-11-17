```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraScreen, photoLibrary, settings, sharesheet } from '@markless/device';
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

	const useCameraScreen = async () => {
		const taken = await cameraScreen.open();
		if (taken) photo = taken;
	};

	const choosePhoto = async () => {
		const chosen = await photoLibrary.open();
		if (chosen) photo = chosen;
	};

	const share = async () => {
		const current = photo;
		if (current) await sharesheet.open({ url: current.url });
	};

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
		<button onClick={useCameraScreen}>Use phone camera</button>
		<button onClick={choosePhoto}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (message) {
			<p>{message}</p>
		}
		@if (photo) {
			<section>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={share}>Share</button>
			</section>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- I assumed handlers can be `async` functions, and that assigning to state after an `await` updates the page.
- I assumed `@if` narrows `photo` to non-null inside its block. In the share handler I copy it to a local and check it again anyway.
- I assumed `base.camera` takes its camera from a `const` made in the same component body, as the sheet says.
- I assumed the shutter should be disabled until `cam.ready` is true. `takePhoto()` already waits until the camera is ready, so this only affects how the button looks.
- I assumed a cancelled camera screen or photo library (which returns `null`) should keep the previous photo.
- I assumed `Photo` is exported as a type from `@markless/device`, which the sheet shows.
- I assumed a refused permission from `takePhoto()` (an error named `NotAllowedError`) should show its message. `cam.access` becomes `'denied'` and that shows the Settings button.

## Calls
- `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- `cameraScreen.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
