```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, choosePhoto, openSettings, openShareSheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let problem = state('');

	async function shoot() {
		try {
			photo = await cam.takePhoto();
			problem = '';
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	async function usePhoneCamera() {
		try {
			const taken = await camera.takePhoto();
			if (taken) photo = taken;
			problem = '';
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	async function pick() {
		try {
			const chosen = await choosePhoto();
			if (chosen) photo = chosen;
			problem = '';
		} catch (error) {
			problem = (error as Error).message;
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
		<button onClick={pick}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
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
- That `@if` with no `@else` is allowed, and that `@if (photo)` narrows `photo` to non-null inside the block.
- That plain `async function` handlers declared in the body can assign to `state` variables, and that an `onClick` handler can be a function that takes no arguments.
- That `camera(...)` returns a plain object whose fields (`access`, `ready`) are live when read in markup, so it doesn't need to go inside `@try`.
- That `camera.takePhoto()` and `choosePhoto()` may throw (for example a `NotAllowedError`), so I catch errors and show the message.
- That a person cancelling should keep the previous photo rather than clear it.
- That the import path `@markless/ui` exports `base` directly.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`)
- Phone's camera screen: `camera.takePhoto()`
- Photo library: `choosePhoto()`

Tools used: Read (once, to read the instruction file as directed)
