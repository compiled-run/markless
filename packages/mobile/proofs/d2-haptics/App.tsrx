import { state } from '@markless/core';
import { haptics } from '@markless/device';

export default function App() @{
	let taps = state(0);
	<main>
		<h1>Haptics</h1>
		<button
			onClick={() => {
				haptics.tap();
				taps++;
			}}
		>
			Tapped {taps}
		</button>
	</main>
}
