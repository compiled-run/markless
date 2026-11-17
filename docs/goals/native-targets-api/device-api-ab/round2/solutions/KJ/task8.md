```tsrx
// file: task8/Status.tsrx
import { device } from '@markless/device';

export default function Status() @{
	<section>
		@if (!device.network.online) {
			<p role="status">Offline</p>
		}
		<p>{`Heading: ${device.compass.heading === null ? '' : Math.round(device.compass.heading)}`}</p>
	</section>
}
```
