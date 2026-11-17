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

	const run = async (task: () => Promise<Photo | null>) => {
		message = '';
		try {
			const taken = await task();
			if (taken) photo = taken;
		} catch (error) {
			const failure = error as Error;
			message = failure.name === 'NotAllowedError' ? 'Camera access was refused.' : failure.message;
		}
	};

	<main>
		<base.camera el={cam} class="viewfinder" />
		<div>
			<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Take photo</button>
			<button onClick={() => run(() => camera.takePhoto())}>Use phone camera</button>
			<button onClick={() => run(() => choosePhoto())}>Choose a photo</button>
		</div>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (photo) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={() => openShareSheet({ url: photo!.url })}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- That `run` can be an ordinary async function declared in the body and called from handlers, and that assigning `photo` or `message` inside it after an `await` still updates the page.
- That the narrowing done by `@if (photo)` does not reach a handler inside it, so I wrote `photo!.url`.
- That `camera.takePhoto()` and `choosePhoto()` can also reject with `NotAllowedError`, so they go through the same error handling.
- That disabling the shutter until `cam.ready` is true is fine. The sheet says `takePhoto()` waits until the camera is ready anyway.
- That `@if` with no `@else` is allowed, and that `disabled`, `width` and `height` are passed through as normal attributes.

## Calls
- In-page camera photo: `cam.takePhoto()`, where `cam = camera({ facing: 'back' })` is made in the component body
- Phone's camera screen: `camera.takePhoto()`
- Photo library: `choosePhoto()`

Tools used: Read (once, to read the instructions file)
