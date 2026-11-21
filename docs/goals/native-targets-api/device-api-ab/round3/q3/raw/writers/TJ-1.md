```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, systemCamera, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);

	<main>
		<base.camera el={cam} />
		<button
			disabled={!cam.ready}
			onClick={async () => {
				photo = await cam.takePhoto();
			}}
		>
			Take photo
		</button>
		<button
			onClick={async () => {
				const taken = await systemCamera.open();
				if (taken) photo = taken;
			}}
		>
			Use phone camera
		</button>
		<button
			onClick={async () => {
				const chosen = await photoLibrary.open();
				if (chosen) photo = chosen;
			}}
		>
			Choose a photo
		</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (photo) {
			<>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button
					onClick={async () => {
						if (photo) await sharesheet.open({ url: photo.url });
					}}
				>
					Share
				</button>
			</>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- I guessed that `@if` narrows `photo` to non-null inside the block. The Share handler checks it again anyway.
- I guessed that `base.camera` is imported as a named export from `@markless/ui`.
- I guessed that it is fine to disable the shutter button while `cam.ready` is false. `takePhoto()` waits until the camera is ready anyway.
- I guessed that "refused" means `cam.access === 'denied'`, and that a rejected `takePhoto` (a `NotAllowedError`) needs no handling of its own.
- I guessed that `@if` works without an `@else`.
- I guessed that async arrow functions are allowed as `onClick` handlers.

## Calls
- `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- `systemCamera.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
