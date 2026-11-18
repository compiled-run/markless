import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { base } from '@markless/ui';

function Shooter() @{
	const cam = camera();
	let photo = state('');
	<section>
		<base.camera el={cam} />
		<button
			onClick={async () => {
				photo = (await cam.takePhoto()).url;
			}}
		>
			Take a photo
		</button>
		<img src={photo} alt="" />
	</section>
}

export default function App() @{
	<main>
		@if (!platform.web) {
			<Shooter />
		}
	</main>
}
