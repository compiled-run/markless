```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import {
	camera,
	takePhoto,
	choosePhoto,
	openSettings,
	openShareSheet,
	type Photo,
} from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let message = state('');

	async function run(action: () => Promise<Photo | null>) {
		message = '';
		try {
			const result = await action();
			if (result) photo = result;
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
	}

	<main>
		<base.camera el={cam} />
		<button disabled={cam.access === 'denied'} onClick={() => run(() => cam.takePhoto())}>
			{cam.ready ? 'Take photo' : 'Starting camera…'}
		</button>
		<button onClick={() => run(() => takePhoto())}>Use phone camera</button>
		<button onClick={() => run(() => choosePhoto())}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message) {
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
- That `@if` narrows `photo` inside its handlers. I used `photo!` in the share handler to be safe.
- That event handlers can be async, or can call async helpers declared in the component body.
- That `cam.ready`, `cam.access` and `photo` work as live values when read directly in markup.
- That a `<button>` in this framework accepts the `disabled` attribute as a boolean.
- That `Photo.url` is suitable to share as the share sheet's `url`.

## Calls
- In-page camera photo: `cam.takePhoto()` (with `const cam = camera()` made in the component body)
- Phone camera screen: `takePhoto()` from `@markless/device`
- Photo library: `choosePhoto()` from `@markless/device`

Tools used: Read (once, to read the instructions file)
