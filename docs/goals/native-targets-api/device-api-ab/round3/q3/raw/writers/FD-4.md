```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, choosePhoto, openSettings, openShareSheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let refused = state(false);
	let message = state('');

	const run = async (action: () => Promise<Photo | null>) => {
		message = '';
		try {
			const taken = await action();
			if (taken) photo = taken;
		} catch (error) {
			if (error instanceof Error && error.name === 'NotAllowedError') {
				refused = true;
			} else {
				message = error instanceof Error ? error.message : String(error);
			}
		}
	};

	<main>
		<base.camera el={cam} class="viewfinder" />
		<div class="controls">
			<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Shutter</button>
			<button onClick={() => run(() => camera.takePhoto())}>Use phone camera</button>
			<button onClick={() => run(() => choosePhoto())}>Choose a photo</button>
		</div>
		@if (cam.access === 'denied' || refused) {
			<p>
				{'Camera access was refused.'}
				<button onClick={() => openSettings()}>Open Settings</button>
			</p>
		}
		@if (message) {
			<p role="alert">{message}</p>
		}
		@if (photo) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={() => photo && openShareSheet({ title: 'Photo', url: photo.url })}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- Async arrow functions are fine as `onClick` handlers, and a `try/catch` inside a handler is allowed.
- `@if (photo)` narrows `photo` to a non-null value inside the block. I also kept a null check in the Share handler in case it doesn't.
- `disabled={!cam.ready}` re-renders live, because the sheet says the camera's fields are live.
- `base` is imported as a named export from `@markless/ui`, and `<base.camera>` works as JSX member-expression syntax.
- The phone camera screen and the photo library may also reject with a `NotAllowedError`. When they do, I show the Settings button.
- A refused camera permission appears as `cam.access === 'denied'` without any extra work.

## Calls
- In-page camera photo: `cam.takePhoto()`, where `cam = camera({ facing: 'back' })`
- Phone's camera screen: `camera.takePhoto()`
- Photo library: `choosePhoto()`

Tools used: Read (once, to read the instructions file only)
