```tsrx
// file: task8/Status.tsrx
import { heading, isOnline } from '@markless/device';

export default function Status() @{
	const online = isOnline();
	const north = heading();

	<section>
		@if (!online) {
			<p role="status">Offline</p>
		}
		<p>{`Heading: ${north === null ? '' : Math.round(north)}`}</p>
	</section>
}
```
