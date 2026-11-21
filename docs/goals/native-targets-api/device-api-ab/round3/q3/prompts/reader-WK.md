You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks; `shared()` and `storage()` come from Markless itself (`@markless/core`).

This app runs on phones. `@markless/device` is a package of device features; `base.camera` from `@markless/ui` shows a camera. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

=== CODE ===
```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, choosePhoto, openSettings, openShareSheet, takePhoto, type Photo } from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera();
	let last = state<Photo | null>(null);

	<main>
		@if (cam.access === 'denied') {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
			</div>
		} @else {
			<base.camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { last = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { last = (await takePhoto()) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await choosePhoto()) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) openShareSheet({ url: last.url }); }}>Share</button>
	</main>
}
```
=== END CODE ===

Questions:
1. Which calls open a screen of the phone's own, outside this page? Quote each call.
2. Which call uses the camera shown on this page? Quote it.
3. For each call that the buttons make, what comes back (if anything)?
4. What is the difference between pressing "Use phone camera" and pressing "Choose a photo"?
5. Is there any pair of calls you could mix up, or a name that made you unsure? Quote it.

Output format: lines `1:` … `5:`; end with `Tools used: none`.
