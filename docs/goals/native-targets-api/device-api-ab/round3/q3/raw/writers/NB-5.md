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

	async function shoot() {
		problem = '';
		try {
			photo = await cam.takePhoto();
		} catch (error) {
			problem = (error as Error).name === 'NotAllowedError' ? 'Camera access was refused.' : (error as Error).message;
		}
	}

	async function useScreen() {
		problem = '';
		try {
			const taken = await cameraScreen.open();
			if (taken) photo = taken;
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	async function choose() {
		problem = '';
		try {
			const chosen = await photoLibrary.open();
			if (chosen) photo = chosen;
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	async function share() {
		const current = photo;
		if (current) await sharesheet.open({ url: current.url });
	}

	<main>
		<base.camera el={cam} />
		<button onClick={shoot} disabled={cam.access === 'denied'}>Shutter</button>
		<button onClick={useScreen}>Use phone camera</button>
		<button onClick={choose}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<p>
				Camera access is off.
				<button onClick={() => settings.open()}>Open Settings</button>
			</p>
		}
		@if (problem) {
			<p>{problem}</p>
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
- `cam.access`, `photo` and `problem` are read live in the markup, so the "Open Settings" button and the photo appear on their own when those values change.
- Handlers can be plain `async` functions declared in the body, and assigning state inside them after an `await` updates the page.
- `takePhoto()` rejects with a `NotAllowedError` when access is refused. Whether `cameraScreen.open()` and `photoLibrary.open()` can reject is not documented, so I catch errors there too.
- Narrowing `photo` inside `@if (photo)` works for the `{photo.url}` reads. In the share handler I copy `photo` into a local and check it before sharing.
- A cancel (`null`) leaves the previous photo in place.

## Calls
- `cam.takePhoto()` (where `const cam = camera({ facing: 'back' })` and `<base.camera el={cam} />`)
- `cameraScreen.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instruction file as directed)
