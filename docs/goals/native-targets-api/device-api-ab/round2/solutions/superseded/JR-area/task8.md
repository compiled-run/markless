```tsrx
// file: task8/Status.tsrx
import { compass, network } from '@markless/device';

export default function Status() @{
	const net = network();
	const north = compass();

	<section>
		@if (!net.online) {
			<p role="status">Offline</p>
		}
		<p>{`Heading: ${north.heading === null ? '' : Math.round(north.heading)}`}</p>
	</section>
}
```
