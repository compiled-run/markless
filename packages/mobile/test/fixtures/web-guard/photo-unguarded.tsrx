import { state } from '@markless/core';
import { camera } from '@markless/device';
import { base } from '@markless/ui';

export default function App() @{
	const cam = camera();
	let photo = state('');
	<main>
		<base.camera el={cam} />
		<button
			onClick={async () => {
				photo = (await cam.takePhoto()).url;
			}}
		>
			Take a photo
		</button>
		<img src={photo} alt="" />
	</main>
}
