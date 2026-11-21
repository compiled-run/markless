```tsrx
import { state } from '@markless/core';
import { Compass, Network } from '@markless/device';

export default function Status() @{
	let online = state(true);
	let north = state<number | null>(null);

	<section
		attach={() => {
			Network.getStatus().then((status) => (online = status.connected));
			const stopNetwork = Network.addListener('change', (status) => (online = status.connected));
			const stopCompass = Compass.addListener((reading) => (north = reading.heading));
			return () => {
				stopNetwork();
				stopCompass();
			};
		}}
	>
		@if (!online) {
			<p role="status">Offline</p>
		}
		<p>{north === null ? 'Finding heading…' : `Heading ${Math.round(north)}°`}</p>
	</section>
}
```
