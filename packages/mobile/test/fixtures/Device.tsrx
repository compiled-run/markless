import { state } from '@markless/core';
import { haptics, network } from '@markless/device';

export default function Device() @{
	let taps = state(0);
	<main>
		<p>{network.online ? 'Online' : 'Offline'}</p>
		<button
			onClick={() => {
				taps++;
				haptics.tap();
			}}
		>
			Tapped {taps}
		</button>
	</main>
}
