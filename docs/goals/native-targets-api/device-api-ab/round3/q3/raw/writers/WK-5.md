```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, choosePhoto, openSettings, openShareSheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	<main>
		<base.camera el={cam} />
		<button
			disabled={!cam.ready}
			onClick={async () => {
				try {
					photo = await cam.takePhoto();
					message = '';
				} catch (error) {
					message = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : 'Could not take a photo.';
				}
			}}
		>
			Shutter
		</button>
		<button
			onClick={async () => {
				try {
					const taken = await takePhoto();
					if (taken) photo = taken;
				} catch (error) {
					message = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : 'Could not open the camera.';
				}
			}}
		>
			Use phone camera
		</button>
		<button
			onClick={async () => {
				try {
					const chosen = await choosePhoto();
					if (chosen) photo = chosen;
				} catch (error) {
					message = (error as Error).name === 'NotAllowedError' ? 'Photo access was refused.' : 'Could not open the photo library.';
				}
			}}
		>
			Choose a photo
		</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (photo !== null) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={async () => { if (photo) await openShareSheet({ url: photo.url }); }}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- Event handlers can be `async` functions, and assigning state after an `await` updates the page.
- The camera should face the back. The sheet does not say what the default is, so I set `facing: 'back'` explicitly.
- Inside `@if (photo !== null)`, TypeScript narrowing may not reach the handler, so the handler checks `photo` again.
- I disable the shutter until `cam.ready` is true, even though `takePhoto()` already waits until the camera is ready.
- A `NotAllowedError` from the phone camera or the photo library is shown as a message. Only the in-page camera's `access` field controls the "Open Settings" button.
- `@markless/ui` exports `base` as a named export.
- Leaving out `@else` after `@if` is allowed.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- Phone's camera screen: `takePhoto()` from `@markless/device`
- Photo library: `choosePhoto()` from `@markless/device`

Tools used: Read (once, to read the instruction file as directed)
