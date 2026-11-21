```tsx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, takePhoto, choosePhoto, openSettings, openShareSheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let problem = state('');

	async function run(action: () => Promise<Photo | null>) {
		problem = '';
		try {
			const result = await action();
			if (result) photo = result;
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	<main>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Shutter</button>
		<button onClick={() => run(() => takePhoto())}>Use phone camera</button>
		<button onClick={() => run(() => choosePhoto())}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (photo) {
			<section>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button onClick={() => openShareSheet({ url: photo!.url })}>Share</button>
			</section>
		}
		@if (problem) {
			<p role="alert">{problem}</p>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- Plain `async` functions declared in the component body, with `try`/`catch` inside them, are allowed in handlers, and assigning to state inside them updates the page.
- `@if` works with a state value of type `Photo | null` and narrows it inside the block. I still used `photo!` in the Share handler to be safe.
- Disabling the shutter until `cam.ready` is true is optional, because `takePhoto()` waits until the camera is ready anyway.
- `cam.access` becomes `'denied'` when the person refuses, which shows the "Open Settings" button. A refused permission during a call is caught and its message is shown.

## Calls
- `cam.takePhoto()`, where `cam = camera({ facing: 'back' })` is shown with `<base.camera el={cam} />`
- `takePhoto()` from `@markless/device`
- `choosePhoto()` from `@markless/device`

Tools used: Read (once, to read the instruction file)
