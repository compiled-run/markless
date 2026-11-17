```tsrx
import { compass, network } from '@markless/device';

export default function Status() @{
	const net = network();
	const dial = compass();

	<section>
		@if (!net.online) {
			<p role="status">Offline</p>
		}
		<p>{dial.heading === null ? 'Finding heading…' : `Heading ${Math.round(dial.heading)}°`}</p>
	</section>
}
```
