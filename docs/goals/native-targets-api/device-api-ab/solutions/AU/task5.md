```tsrx
import { deviceOrientation, onLine } from '@markless/device';

export default function Status() @{
	const online = onLine();
	const orientation = deviceOrientation();

	<section>
		@if (!online) {
			<p role="status">Offline</p>
		}
		<p>{orientation.alpha === null ? 'Finding heading…' : `Heading ${Math.round(orientation.alpha)}°`}</p>
	</section>
}
```
