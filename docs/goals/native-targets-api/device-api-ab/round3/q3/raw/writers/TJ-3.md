```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, systemCamera, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);
	let message = state('');

	const run = async (open: () => Promise<Photo | null>) => {
		message = '';
		try {
			const photo = await open();
			if (photo) last = photo;
		} catch (error) {
			message = error instanceof Error && error.name === 'NotAllowedError'
				? 'Camera access was refused.'
				: 'Something went wrong.';
		}
	};

	<main>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Take photo</button>
		<button onClick={() => run(() => systemCamera.open())}>Use phone camera</button>
		<button onClick={() => run(() => photoLibrary.open())}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => settings.open()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (last) {
			<section>
				<img src={last.url} width={last.width} height={last.height} alt="Last photo" />
				<button onClick={() => sharesheet.open({ url: last!.url })}>Share</button>
			</section>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- That `@if` blocks can be used without an `@else`, and that `last` narrows inside `@if (last)` for rendering. I kept a `!` in the handler in case it doesn't narrow there.
- That a local helper arrow function (`run`) in the body is fine, and that handlers may be async and fire off promises without awaiting them.
- That `disabled={!cam.ready}` updates live, since the sheet says fields are live.
- That `systemCamera.open()` and `photoLibrary.open()` might reject with `NotAllowedError`, so they share the same error handling as `takePhoto()`.
- That the Settings button only needs to depend on the in-page camera's `access` being `'denied'`.
- That `cam.takePhoto()` should run inside an arrow so `this` stays bound.

## Calls
- `cam.takePhoto()` (where `const cam = camera()`)
- `systemCamera.open()`
- `photoLibrary.open()`

Tools used: Read (only to read the instructions file)
