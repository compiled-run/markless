```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraApp, photoLibrary, settings, sharesheet } from '@markless/device';
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
			Shutter
		</button>
		<button
			onClick={async () => {
				const taken = await cameraApp.open();
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
			<section>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button
					onClick={async () => {
						if (photo) await sharesheet.open({ url: photo.url });
					}}
				>
					Share
				</button>
			</section>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- I assumed `<base.camera el={cam} />` is valid JSX for a namespaced component, as the sheet suggests.
- I assumed `@if` narrows `photo` to non-null inside its block. I added a second null check in the Share handler in case it does not.
- I disabled the shutter until `cam.ready` is true. The sheet says `takePhoto()` waits until the camera is ready anyway, so this is only a UI choice.
- I did not catch a `NotAllowedError` from `takePhoto()` in the handler. I assumed that once access is refused, `cam.access` becomes `'denied'`, which shows the Settings button.
- I assumed a `Photo` returned by `cameraApp.open()` or `photoLibrary.open()` can be put in a plain `state` and shown after its handler finishes.

## Calls
- `cam.takePhoto()` (where `cam = camera(...)`)
- `cameraApp.open()`
- `photoLibrary.open()`

Tools used: Read (once, to read the instructions file only)
