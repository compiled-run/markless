Thank you. Here is the same component written five ways, one per design of `@markless/device`, each with a two-letter label; the one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

=== VERSION FD ===
```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, choosePhoto, openSettings, openShareSheet, type Photo } from '@markless/device';

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
		<button onClick={async () => { last = (await camera.takePhoto()) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await choosePhoto()) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) openShareSheet({ url: last.url }); }}>Share</button>
	</main>
}
```
=== END VERSION FD ===

=== VERSION TJ ===
```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, systemCamera, photoLibrary, settings, sharesheet, type Photo } from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera();
	let last = state<Photo | null>(null);

	<main>
		@if (cam.access === 'denied') {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => settings.open()}>Open Settings</button>
			</div>
		} @else {
			<base.camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { last = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { last = (await systemCamera.open()) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await photoLibrary.open()) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) sharesheet.open({ url: last.url }); }}>Share</button>
	</main>
}
```
=== END VERSION TJ ===

=== VERSION NB ===
```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, cameraScreen, photoLibrary, settings, sharesheet, type Photo } from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera();
	let last = state<Photo | null>(null);

	<main>
		@if (cam.access === 'denied') {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => settings.open()}>Open Settings</button>
			</div>
		} @else {
			<base.camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { last = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { last = (await cameraScreen.open()) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await photoLibrary.open()) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) sharesheet.open({ url: last.url }); }}>Share</button>
	</main>
}
```
=== END VERSION NB ===

=== VERSION RZ ===
```tsrx
// file: PhotoStudio.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, cameraApp, photoLibrary, settings, sharesheet, type Photo } from '@markless/device';

export default function PhotoStudio() @{
	const cam = camera();
	let last = state<Photo | null>(null);

	<main>
		@if (cam.access === 'denied') {
			<div>
				<p>Camera access is off.</p>
				<button onClick={() => settings.open()}>Open Settings</button>
			</div>
		} @else {
			<base.camera el={cam} />
		}
		<button disabled={!cam.ready} onClick={async () => { last = await cam.takePhoto(); }}>Shutter</button>
		<button onClick={async () => { last = (await cameraApp.open()) ?? last; }}>Use phone camera</button>
		<button onClick={async () => { last = (await photoLibrary.open()) ?? last; }}>Choose a photo</button>
		@if (last) {
			<img src={last.url} alt="Last photo" />
		}
		<button disabled={!last} onClick={() => { if (last) sharesheet.open({ url: last.url }); }}>Share</button>
	</main>
}
```
=== END VERSION RZ ===

=== VERSION WK ===
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
=== END VERSION WK ===

Questions:
A. Rank all five from clearest to least clear: in which is it easiest to tell which calls open a screen of the phone's own and which use the camera on the page?
B. Among the versions that open screens with `.open()`, which name for the phone's camera screen reads best, and why?
C. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: `## Ranking` with lines `1. XX — reason` … `5. XX — reason`; then `B:` and `C:`; end with `Tools used: none`.
