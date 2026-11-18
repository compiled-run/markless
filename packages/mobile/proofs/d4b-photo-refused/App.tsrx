import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { base } from '@markless/ui';

function Shooter() @{
	const cam = camera();
	let shots = state(0);
	<section>
		<p>Access {camera.access}</p>
		@try {
			<div>
				<base.camera el={cam} />
				<button
					onClick={async () => {
						await cam.takePhoto();
						shots++;
					}}
				>
					Take photo
				</button>
				<p>Photos {shots}</p>
			</div>
		} @catch (error) {
			<p>Photo failed: {error.name}</p>
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
