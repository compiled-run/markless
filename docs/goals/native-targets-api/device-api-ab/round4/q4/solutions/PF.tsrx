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
