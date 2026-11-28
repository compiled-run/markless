Thank you. Now here are five versions of the same page, one per design of `@markless/device`, each with a two-letter label. The one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

=== VERSION HN ===
```tsrx
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
```
=== END VERSION HN ===

=== VERSION QT ===
```tsrx
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
		@if (network.supported && !net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<p>{`Press ${modifierKey === '⌘' ? '⌘K' : 'Ctrl+K'} to search`}</p>
		@if (camera.supported) {
			<section>
				<base.camera el={cam} />
				<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
				@if (photo) {
					<img src={photo.url} alt="Last photo" />
				}
			</section>
		} @else {
			<p>The camera works in the app.</p>
		}
		@if (geolocation.supported) {
			<section>
				@if (here.access === 'denied') {
					<p>Location access is off.</p>
				} @else if (here.position) {
					<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
				} @else {
					<p>Finding you…</p>
				}
			</section>
		} @else {
			<p>Location works in the app.</p>
		}
		<button onClick={() => { likes++; haptics.tap('light'); }}>{`Like (${likes})`}</button>
		@if (sharesheet.supported) {
			<button onClick={() => sharesheet.open({ title, url })}>Share</button>
		}
	</main>
}
```
=== END VERSION QT ===

=== VERSION VR ===
```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, geolocation, haptics, network, platform, sharesheet, type Photo } from '@markless/device';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera();
	const here = geolocation();
	const net = network();
	let photo = state<Photo | null>(null);
	let likes = state(0);

	<main>
		@if ((platform.ios || platform.android) && !net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<p>{`Press ${platform.macos ? '⌘K' : 'Ctrl+K'} to search`}</p>
		@if (platform.ios || platform.android) {
			<section>
				<base.camera el={cam} />
				<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
				@if (photo) {
					<img src={photo.url} alt="Last photo" />
				}
			</section>
		} @else {
			<p>The camera works in the app.</p>
		}
		@if (platform.ios || platform.android) {
			<section>
				@if (here.access === 'denied') {
					<p>Location access is off.</p>
				} @else if (here.position) {
					<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
				} @else {
					<p>Finding you…</p>
				}
			</section>
		} @else {
			<p>Location works in the app.</p>
		}
		<button onClick={() => { likes++; haptics.tap('light'); }}>{`Like (${likes})`}</button>
		@if (platform.ios || platform.android) {
			<button onClick={() => sharesheet.open({ title, url })}>Share</button>
		}
	</main>
}
```
=== END VERSION VR ===

=== VERSION LX ===
```tsrx
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
```
=== END VERSION LX ===

=== VERSION GP ===
```tsrx
// file: Post.tsrx
import { state } from '@markless/core';
import { base } from '@markless/ui';
import { camera, geolocation, haptics, network, platform, sharesheet, type Photo } from '@markless/device';

export default function Post({ title, url }: { title: string; url: string }) @{
	const cam = camera();
	const here = geolocation();
	const net = network();
	let photo = state<Photo | null>(null);
	let likes = state(0);

	<main>
		@if (network.supported && !net.online) {
			<p role="status">You are offline</p>
		}
		<h1>{title}</h1>
		<p>{`Press ${platform.macos ? '⌘K' : 'Ctrl+K'} to search`}</p>
		@if (camera.supported) {
			<section>
				<base.camera el={cam} />
				<button disabled={!cam.ready} onClick={async () => { photo = await cam.takePhoto(); }}>Take photo</button>
				@if (photo) {
					<img src={photo.url} alt="Last photo" />
				}
			</section>
		} @else {
			<p>The camera works in the app.</p>
		}
		@if (geolocation.supported) {
			<section>
				@if (here.access === 'denied') {
					<p>Location access is off.</p>
				} @else if (here.position) {
					<p>{`You are at ${here.position.latitude.toFixed(4)}, ${here.position.longitude.toFixed(4)}`}</p>
				} @else {
					<p>Finding you…</p>
				}
			</section>
		} @else {
			<p>Location works in the app.</p>
		}
		<button onClick={() => { likes++; haptics.tap('light'); }}>{`Like (${likes})`}</button>
		@if (sharesheet.supported) {
			<button onClick={() => sharesheet.open({ title, url })}>Share</button>
		}
	</main>
}
```
=== END VERSION GP ===

Questions:
A. Rank all five from clearest to least clear for someone reading the code: in which is it easiest to tell what a website visitor gets and what an iPhone user gets?
B. Which version would you trust most not to ship a button that does nothing on the website, and which least?
C. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: `## Ranking` with lines `1. XX — reason` … `5. XX — reason`; then `B:` and `C:`; end with `Tools used: none`.
