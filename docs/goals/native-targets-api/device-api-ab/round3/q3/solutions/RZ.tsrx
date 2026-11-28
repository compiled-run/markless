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
