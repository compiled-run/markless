```tsrx
import { state } from '@markless/core';
import { watchHeading, watchNetwork } from '@markless/device';

export default function Status() @{
	let online = state(true);
	let north = state<number | null>(null);

	<section
		attach={() => {
			const stopNetwork = watchNetwork((status) => (online = status.online));
			const stopHeading = watchHeading((reading) => (north = reading.degrees));
			return () => {
				stopNetwork();
				stopHeading();
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
