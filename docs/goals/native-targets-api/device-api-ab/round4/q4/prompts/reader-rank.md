Thank you. Here is the same page written six ways, each with a two-letter label; the one you just read is among them. Only the camera and sheet tags, and their imports, differ. Answer from this message and the earlier one alone; do not use any tools.

=== VERSION NT ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer, native } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<native.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<native.sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</native.sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION NT ===

=== VERSION PF ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<platform.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<platform.sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</platform.sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION PF ===

=== VERSION IA ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { android, base, drawer, ios, web } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		@if (platform.ios) {
			<ios.camera el={cam} class="preview" />
		} @else if (platform.android) {
			<android.camera el={cam} class="preview" />
		} @else {
			<web.camera el={cam} class="preview" />
		}
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		@if (platform.ios) {
			<ios.sheet open={choosing} onChange={(open) => (choosing = open)}>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
				}
			</ios.sheet>
		} @else if (platform.android) {
			<android.sheet open={choosing} onChange={(open) => (choosing = open)}>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
				}
			</android.sheet>
		} @else {
			<web.sheet open={choosing} onChange={(open) => (choosing = open)}>
				<h2>Choose a filter</h2>
				@for (const name of filters; key name) {
					<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
				}
			</web.sheet>
		}
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION IA ===

=== VERSION SY ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer, system } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<system.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<system.sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</system.sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION SY ===

=== VERSION BC ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<base.camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<base.sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</base.sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION BC ===

=== VERSION BT ===
```tsrx
// file: pages/capture.tsrx
import { state } from '@markless/core';
import { base, drawer } from '@markless/ui';
import { camera, platform, type Photo } from '@markless/device';

const filters = ['None', 'Mono', 'Warm'];

export default function Capture() @{
	const cam = camera();
	let photo = state<Photo | null>(null);
	let filter = state('None');
	let choosing = state(false);

	<main>
		<camera el={cam} class="preview" />
		<p>{`Filter: ${filter}`}</p>
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		<button onClick={() => (choosing = true)}>Filters</button>
		@if (platform.ios) {
			<p>Photos also save to your library.</p>
		}
		<sheet open={choosing} onChange={(open) => (choosing = open)}>
			<h2>Choose a filter</h2>
			@for (const name of filters; key name) {
				<button onClick={() => { filter = name; choosing = false; }}>{name}</button>
			}
		</sheet>
		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<ul>
						<li>Nice light.</li>
						<li>Try Mono.</li>
						<li>Great shot!</li>
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</main>
}
```
=== END VERSION BT ===

Questions:
A. Rank all six from clearest to least clear for someone reading the code: in which is it easiest to tell where the camera and sheet come from, that the system draws them, and what the website gets?
B. Which name best says "this is drawn by the platform, not by the page": `native`, `platform`, `system`, `base`, per-platform `ios`/`android`/`web`, or a bare tag? Why?
C. In PF, `platform.ios` and `platform.sheet` come from the same object. Does that read clearly, or could the two uses be confused? How?
D. Which would you rather write, and why?
E. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: `## Ranking` with lines `1. XX — reason` … `6. XX — reason`; then `B:` to `E:`; end with `Tools used: none`.
