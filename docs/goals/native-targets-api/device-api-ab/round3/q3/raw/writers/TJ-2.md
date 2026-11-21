```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, systemCamera, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	<main>
		<base.camera el={cam} />
		<button
			disabled={cam.access === 'denied'}
			onClick={async () => {
				try {
					photo = await cam.takePhoto();
					message = '';
				} catch (error) {
					message = (error as Error).message;
				}
			}}
		>
			Shutter
		</button>
		<button
			onClick={async () => {
				try {
					const taken = await systemCamera.open();
					if (taken) photo = taken;
				} catch (error) {
					message = (error as Error).message;
				}
			}}
		>
			Use phone camera
		</button>
		<button
			onClick={async () => {
				try {
					const chosen = await photoLibrary.open();
					if (chosen) photo = chosen;
				} catch (error) {
					message = (error as Error).message;
				}
			}}
		>
			Choose a photo
		</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (photo) {
			<section>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={() => sharesheet.open({ url: photo!.url })}>Share</button>
			</section>
		}
		@if (message) {
			<p>{message}</p>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- `@if` without `@else` is allowed, and `@if (photo)` narrows `photo` inside the block (I added `!` in the handler just in case).
- A plain `try`/`catch` inside an async handler is fine for errors that happen in handlers, such as a refused permission.
- `base` is a named export of `@markless/ui`, and `Photo` can be imported as a type from `@markless/device`.
- Disabling the shutter while access is denied is my own choice; `takePhoto()` already waits until the camera is ready.
- If the person cancels (`null`), the last photo stays as it was.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- Phone's camera screen: `systemCamera.open()`
- Photo library: `photoLibrary.open()`

Tools used: Read (once, to read the instructions file)
