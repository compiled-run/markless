```tsrx
// file: task2/Here.tsrx
import { computed, state } from '@markless/core';
import { location, openSettings } from '@markless/device';

export default function Here() @{
	let attempt = state(0);
	const where = computed(async () => {
		attempt;
		return await location.current();
	});

	<section>
		@try {
			<p>{`${where.latitude.toFixed(4)}, ${where.longitude.toFixed(4)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>Location access is off.</p>
				<button onClick={() => openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```
