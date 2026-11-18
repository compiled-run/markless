import { state } from '@markless/core';
import { camera } from '@markless/device';

export default function App() @{
	let photo = state('');
	<main>
		@if (camera.supported) {
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
