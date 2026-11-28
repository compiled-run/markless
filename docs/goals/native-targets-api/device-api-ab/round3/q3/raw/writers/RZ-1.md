```tsx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraApp, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	const shoot = async () => {
		message = '';
		try {
			photo = await cam.takePhoto();
		} catch (error) {
			message = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
		}
	};

	const useCameraApp = async () => {
		message = '';
		const taken = await cameraApp.open();
		if (taken) photo = taken;
	};

	const choosePhoto = async () => {
		message = '';
		const chosen = await photoLibrary.open();
		if (chosen) photo = chosen;
	};

	const share = async () => {
		if (photo) await sharesheet.open({ url: photo.url });
	};

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
		<button onClick={useCameraApp}>Use phone camera</button>
		<button onClick={choosePhoto}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (photo !== null) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={share}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- How `@if` is written (`@if (cond) { ... }`), because the guidance names `@if` but doesn't show it.
- That I can call `camera()` directly in the body and keep the result in a plain `const`, without wrapping it in `state`.
- That state such as `photo` can be read straight in handlers and in `@if`, and that inside the `@if` it narrows to non-null.
- That `cam.takePhoto()` rejects with an `Error` named `'NotAllowedError'` when camera access is refused, and that `try`/`catch` inside a handler is the right way to handle that.
- That `disabled={!cam.ready}` is useful even though `takePhoto` already waits until the camera is ready.
- That the `Photo` type can be imported from `@markless/device` and `base` from `@markless/ui` exactly as written.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera(...)`)
- Phone's camera screen: `cameraApp.open()`
- Photo library: `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
