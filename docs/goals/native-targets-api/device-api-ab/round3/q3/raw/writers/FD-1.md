```tsx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, choosePhoto, openSettings, openShareSheet } from '@markless/device';
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
		try {
			const taken = await camera.takePhoto();
			if (taken) photo = taken;
			message = '';
		} catch (error) {
			message = (error as Error).message;
		}
	}

	async function pickPhoto() {
		try {
			const chosen = await choosePhoto();
			if (chosen) photo = chosen;
			message = '';
		} catch (error) {
			message = (error as Error).message;
		}
	}

	async function share() {
		if (!photo) return;
		await openShareSheet({ url: photo.url });
	}

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={!cam.ready}>Shutter</button>
		<button onClick={usePhoneCamera}>Use phone camera</button>
		<button onClick={pickPhoto}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (photo) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={share}>Share</button>
			</figure>
		}
	</main>
}
```

Confidence: 4/5

## Guesses

- Plain `async` handler functions declared in the body, using ordinary `try`/`catch`, are allowed and can assign state.
- Inside `@if (photo)`, the type narrows so I can read `photo.url` there. In `share`, I check for null explicitly.
- `@if` works with no `@else`, and it reacts to the live `cam.access` field.
- Passing `{ facing: 'back' }` is optional. I chose the back camera.
- The `disabled` attribute takes a boolean, and `!cam.ready` keeps it updated.
- A cancelled system screen returns `null`, so I keep the previous photo in that case.

## Calls

- In-page camera photo: `cam.takePhoto()`, where `cam = camera({ facing: 'back' })`
- Phone's camera screen: `camera.takePhoto()`
- Photo library: `choosePhoto()`

Tools used: Read (once, to read the instructions file)
