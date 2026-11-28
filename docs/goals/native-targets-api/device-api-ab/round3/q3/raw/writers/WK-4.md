```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import {
	camera,
	takePhoto,
	choosePhoto,
	openSettings,
	openShareSheet,
	type Photo,
} from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let last = state<Photo | null>(null);
	let message = state('');

	const run = async (action: () => Promise<Photo | null>) => {
		try {
			const photo = await action();
			if (photo) {
				last = photo;
				message = '';
			}
		} catch (error) {
			message =
				(error as Error).name === 'NotAllowedError'
					? 'Camera access was refused.'
					: (error as Error).message;
		}
	};

	<main>
		<base.camera el={cam} class="viewfinder" />
		<button disabled={!cam.ready} onClick={() => run(() => cam.takePhoto())}>Shutter</button>
		<button onClick={() => run(() => takePhoto())}>Use phone camera</button>
		<button onClick={() => run(() => choosePhoto())}>Choose a photo</button>
		@if (cam.access === 'denied') {
			<button onClick={() => openSettings()}>Open Settings</button>
		}
		@if (message !== '') {
			<p>{message}</p>
		}
		@if (last !== null) {
			<figure>
				<img src={last?.url} width={last?.width} height={last?.height} alt="Last photo" />
				<button
					onClick={async () => {
						if (last) await openShareSheet({ url: last.url });
					}}
				>
					Share
				</button>
			</figure>
		}
	</main>
}
```

Confidence: 3/5

## Guesses
- That event handlers may be `async` and may call a local helper defined in the body, and that a `try/catch` inside the handler is the right way to handle a refused permission, since `@try` is for async computeds.
- That `cam.access` and `cam.ready` can be read directly in markup and in `@if`, because the sheet calls the fields "live".
- That `@if (last !== null)` does not narrow the type inside the block, so I used `last?.url`.
- That `base` is a named export of `@markless/ui`, `Photo` can be imported as a type, and `disabled`, `width` and `height` attributes are accepted as written.
- That an empty `<p>` is acceptable for showing the error message.

## Calls
- In-page camera photo: `cam.takePhoto()` (where `cam = camera({ facing: 'back' })`, shown with `<base.camera el={cam} />`)
- Phone's camera screen: `takePhoto()` from `@markless/device`
- Photo library: `choosePhoto()` from `@markless/device`

Tools used: Read (once, to read the instructions file)
