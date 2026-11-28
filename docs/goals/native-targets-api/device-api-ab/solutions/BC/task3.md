```tsrx
import { computed } from '@markless/core';
import { getPosition, openSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async ({ signal }) => await getPosition({ signal }));

	<section>
		@try {
			<p>{`${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```
