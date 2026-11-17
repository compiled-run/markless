```tsrx
import { heading, isOnline } from '@markless/device';

export default function Status() @{
	const online = isOnline();
	const north = heading();

	<section>
		@if (!online) {
			<p role="status">Offline</p>
		}
		<p>{north === null ? 'Finding heading…' : `Heading ${Math.round(north)}°`}</p>
	</section>
}
```
