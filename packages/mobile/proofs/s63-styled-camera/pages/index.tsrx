import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { base } from '@markless/ui';

function Shooter() @{
	const cam = camera();
	let shots = state(0);
	<div class="capture">
		<base.camera el={cam} class="preview" />
		<p class="status">{cam.ready ? 'Camera ready' : 'Camera starting'}</p>
		<button
			type="button"
			class="take"
			onClick={async () => {
				await cam.takePhoto();
				shots++;
			}}
		>
			Take photo
		</button>
		<p>Photos {shots}</p>
	</div>
}

export default function NewPhoto() @{
	<main class="page">
		<h1>New photo</h1>
		@if (!platform.web) {
			<Shooter />
		} @else {
			<p>No camera here</p>
		}
	</main>
}
