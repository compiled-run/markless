```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraScreen, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let problem = state('');

	const shoot = async () => {
		try {
			photo = await cam.takePhoto();
			problem = '';
		} catch (error) {
			problem = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
		}
	};

	const useScreen = async () => {
		try {
			const taken = await cameraScreen.open();
			if (taken) photo = taken;
		} catch (error) {
			problem = (error as Error).message;
		}
	};

	const choose = async () => {
		try {
			const chosen = await photoLibrary.open();
			if (chosen) photo = chosen;
		} catch (error) {
			problem = (error as Error).message;
		}
	};

	const share = async () => {
		if (photo) await sharesheet.open({ url: photo.url });
	};

	<main>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={shoot}>Take photo</button>
		<button onClick={useScreen}>Use phone camera</button>
		<button onClick={choose}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (problem) {
			<p>{problem}</p>
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
- I assumed `@if (photo)` narrows `photo` to non-null inside the block, and that `cam.ready` and `cam.access` can be read directly in markup and update the page when they change.
- I assumed a native `disabled` attribute and plain async arrow handlers are allowed. I also assumed a handler can catch a rejected promise with ordinary `try`/`catch`.
- I assumed `takePhoto()` rejects with a `NotAllowedError` when camera access is refused, and that `cameraScreen.open()` or `photoLibrary.open()` might also reject.
- I assumed the shutter button shows the text "Take photo", since the task does not give a label.
- I assumed `base.camera` is imported from `@markless/ui` as written in the sheet.

## Calls
- `cam.takePhoto()` (with `const cam = camera(...)` made in the component body)
- `cameraScreen.open()`
- `photoLibrary.open()`

Tools used: Read (only to read the instruction file, as the task directed)
