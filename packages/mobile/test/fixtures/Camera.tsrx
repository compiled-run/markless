import { state } from '@markless/core';
import { camera } from '@markless/device';
import { base } from '@markless/ui';

function Shooter() @{
	const cam = camera();
	let photo = state('');
	let shots = state(0);
	let showing = state(true);
	<section>
		@if (showing) {
			<base.camera el={cam} />
		}
		<button onClick={() => (showing = !showing)}>{showing ? 'Hide preview' : 'Show preview'}</button>
		<p>{cam.ready ? 'Camera ready' : 'Camera starting'}</p>
		<p>Facing {cam.facing}</p>
		<button onClick={() => (cam.facing = cam.facing === 'back' ? 'front' : 'back')}>Flip</button>
		<button
			onClick={async () => {
				photo = (await cam.takePhoto()).url;
				shots++;
			}}
		>
			Take photo
		</button>
		<p>Photos {shots}</p>
		@if (photo !== '') {
			<img src={photo} alt="Last photo" />
		}
	</section>
}

export default function App() @{
	<main>
		<h1>Camera</h1>
		<p>Access {camera.access}</p>
		@if (camera.supported) {
			<Shooter />
		} @else {
			<p>No camera here</p>
		}
	</main>
}
