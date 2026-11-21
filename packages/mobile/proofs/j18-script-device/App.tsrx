import { state } from '@markless/core';
import { camera, haptics, location, platform } from '@markless/device';
import { base } from '@markless/ui';
import { place } from '../lib/field.ts';

function Field() @{
	const cam = camera();
	let where = state('Nowhere yet');
	let photo = state('No photo');
	<section>
		<base.camera el={cam} />
		<p>{cam.ready ? 'Camera ready' : 'Camera starting'}</p>
		<p>{where}</p>
		<p>{photo}</p>
		<button
			onClick={async () => {
				where = 'Locating';
				try {
					const here = await location.current();
					where = place(here.latitude, here.longitude);
					haptics.tap();
				} catch (error) {
					where = `Refused: ${(error as Error).name}`;
				}
			}}
		>
			Where am I
		</button>
		<button
			onClick={async () => {
				const shot = await cam.takePhoto();
				let sides = 0;
				for (const side of [shot.width, shot.height]) if (side > 0) sides++;
				photo = sides === 2 ? 'Photo taken' : 'Empty photo';
			}}
		>
			Take photo
		</button>
	</section>
}

export default function App() @{
	<main>
		<h1>Field</h1>
		@if (!platform.web) {
			<Field />
		} @else {
			<p>No device here</p>
		}
	</main>
}
