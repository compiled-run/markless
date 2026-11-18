import { state } from '@markless/core';
import { camera } from '@markless/device';

export default function App() @{
	let photo = state('');
	<main>
		@try {
			<button
				onClick={async () => {
					photo = (await camera.takePhoto()).url;
				}}
			>
				Take a photo
			</button>
		} @catch (error) {
			<p>{error.name}</p>
		}
		<img src={photo} alt="" />
	</main>
}
