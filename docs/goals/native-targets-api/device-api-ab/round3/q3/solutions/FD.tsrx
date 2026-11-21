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
