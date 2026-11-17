// file: Post.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, geolocation, haptics, modifierKey, network, sharesheet, type Photo } from '@markless/device';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera();
	const here = geolocation();
	const net = network();
	let photo = state<Photo | null>(null);
	let likes = state(0);

	<main>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<p>{`Press ${modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search`}</p>
		<section>
			<base.camera el={cam} />
			<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
			@if (photo) {
				<img src={photo.url} alt="Last photo" />
			}
		</section>
		<section>
			@if (here.access === 'denied') {
				<p>Location access is off.</p>
			} @else if (here.position) {
				<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
			} @else {
				<p>Finding you…</p>
			}
		</section>
		<button onClick={() => { likes++; haptics.tap('light'); }}>{`Like (${likes})`}</button>
		<button onClick={() => sharesheet.open({ title, url })}>Share</button>
	</main>
}
