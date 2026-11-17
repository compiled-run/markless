import { state } from '@markless/core';
import { camera, platform } from '@markless/device';

export default function App() @{
	let photo = state('');
	<main>
		@if (!platform.web) {
			<button
				onClick={async () => {
					photo = (await camera.takePhoto()).url;
				}}
			>
				Take a photo
			</button>
		}
		<img src={photo} alt="" />
	</main>
}
