// file: Post.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, geolocation, haptics, modifierKey, network, sharesheet, type Photo } from '@markless/device';

function OfflineBanner() @{
	const net = network();

	<>
		@if (!net.online) {
			<p role="status">You are offline</p>
		}
	</>
}

function Shooter() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<section>
		<base.camera el={cam} />
		<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" />
		}
	</section>
}

function Whereabouts() @{
	const here = geolocation();

	<section>
		@if (here.access === 'denied') {
			<p>Location access is off.</p>
		} @else if (here.position) {
			<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
		} @else {
			<p>Finding you…</p>
		}
	</section>
}

export default function Post({ title, url }: { title: string; url: string }) @{
	let likes = state(0);
	let shareNote = state('');

	<main>
		@try {
			<OfflineBanner />
		} @catch (error) {
			<></>
		}
		<h1>{title}</h1>
		<p>{`Press ${modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search`}</p>
		@try {
			<Shooter />
		} @catch (error) {
			<p>The camera works in the app.</p>
		}
		@try {
			<Whereabouts />
		} @catch (error) {
			<p>Location works in the app.</p>
		}
		<button
			onClick={() => {
				likes++;
				try {
					haptics.tap('light');
				} catch {}
			}}
		>
			{`Like (${likes})`}
		</button>
		<button
			onClick={async () => {
				try {
					await sharesheet.open({ title, url });
				} catch {
					shareNote = 'Sharing works in the app.';
				}
			}}
		>
			Share
		</button>
		@if (shareNote) {
			<p>{shareNote}</p>
		}
	</main>
}
