```tsx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { camera, cameraApp, photoLibrary, settings, sharesheet } from '@markless/device';
import type { Photo } from '@markless/device';
import { base } from '@markless/ui';

export default function PhotoStudio() @{
	const cam = camera({ facing: 'back' });
	let photo = state<Photo | null>(null);
	let problem = state<string | null>(null);

	const keep = (next: Photo | null) => {
		if (next) {
			photo = next;
			problem = null;
		}
	};
	const report = (error: unknown) => {
		problem = error instanceof Error ? error.message : String(error);
	};

	<main>
		<section>
			<base.camera el={cam} />
			<button
				disabled={!cam.ready}
				onClick={async () => {
					try {
						keep(await cam.takePhoto());
					} catch (error) {
						report(error);
					}
				}}
			>
				Shutter
			</button>
		</section>

		@if (cam.access === 'denied') {
			<p>
				Camera access was refused.
				<button onClick={() => settings.open()}>Open Settings</button>
			</p>
		}

		<nav>
			<button
				onClick={async () => {
					try {
						keep(await cameraApp.open());
					} catch (error) {
						report(error);
					}
				}}
			>
				Use phone camera
			</button>
			<button
				onClick={async () => {
					try {
						keep(await photoLibrary.open());
					} catch (error) {
						report(error);
					}
				}}
			>
				Choose a photo
			</button>
		</nav>

		@if (problem) {
			<p role="alert">{problem}</p>
		}

		@if (photo) {
			<figure>
				<img src={photo.url} width={photo.width} height={photo.height} alt="Last photo" />
				<button
					onClick={async () => {
						if (photo) await sharesheet.open({ url: photo.url });
					}}
				>
					Share
				</button>
			</figure>
		}
	</main>
}
```

Confidence: 4/5

## Guesses
- Async event handlers that `await` and assign state are allowed, and a `try/catch` inside a handler is fine.
- The shutter is disabled until `cam.ready` is true. `takePhoto()` would wait anyway, so this is only a UI choice.
- When the person cancels the phone camera or the library (the result is `null`), the last photo stays on the page.
- `@if (photo)` narrows `photo` to non-null inside the block. The handler checks it again to be safe.
- `@markless/ui` exports `base` as a named export, and `Photo` can be imported as a type from `@markless/device`.
- A `.tsrx` `@if` can sit beside other elements inside `<main>`.

## Calls
- In-page camera photo: `cam.takePhoto()`, where `cam = camera({ facing: 'back' })`
- Phone camera screen: `cameraApp.open()`
- Photo library: `photoLibrary.open()`

Tools used: Read (once, to read the instructions file as told)
