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
			message = (error as Error).message;
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
			<>
				<p>Camera access was refused.</p>
				<button onClick={() => settings.open()}>Open Settings</button>
			</>
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

Confidence: 3/5

## Guesses
- `@markless/device` exports `Photo` as a type I can import.
- An `@if` narrows `photo` to non-null inside its block. If it does not, `photo.url` may need a non-null assertion.
- Plain `async` functions declared in the body work as event handlers, and assigning to state after an `await` updates the page.
- `cam.access` and `cam.ready` can be read in markup and in attributes like `disabled`, and they update live.
- Disabling the shutter until `cam.ready` is true is optional, because `takePhoto()` already waits until the camera is ready.
- `cameraApp.open()` and `photoLibrary.open()` might also reject with `NotAllowedError`. I do not handle that.
- Passing a method reference such as `onClick={shoot}` is fine, since the handler ignores the event.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera()`)
- Phone camera screen: `cameraApp.open()`
- Photo library: `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
