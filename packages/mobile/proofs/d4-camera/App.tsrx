import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { native } from '@markless/ui';

function Shooter() @{
	const cam = camera();
	let photo = state('');
	let shots = state(0);
	let showing = state(true);
	<section>
		<p>Access {camera.access}</p>
		@if (showing) {
			<native.camera el={cam} />
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
		@if (!platform.web) {
			<Shooter />
		} @else {
			<p>No camera here</p>
		}
	</main>
}
