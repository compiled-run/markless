```tsrx
import { computed } from '@markless/core';
import { getCurrentPosition, openAppSettings } from '@markless/device';

export default function WhereAmI() @{
	const where = computed(async () => await getCurrentPosition());

	<section>
		@try {
			<p>{`${where.coords.latitude.toFixed(5)}, ${where.coords.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.name === 'NotAllowedError' ? 'Location access is off. Turn it on in Settings.' : error.message}</p>
				<button onClick={() => openAppSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```
Config: `grants` includes `'geolocation'` in `markless.config.ts`, with its usage text under `"geolocation"` in `strings/permissions.json`.
