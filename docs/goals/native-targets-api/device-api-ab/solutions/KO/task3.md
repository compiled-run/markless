```tsrx
import { computed } from '@markless/core';
import { Linking, Location, locationPermission } from '@markless/device';

export default function WhereAmI() @{
	const permission = locationPermission();
	const where = computed(async () => {
		if (permission.state !== 'granted' && (await permission.request()) !== 'granted') {
			throw new Error('Location access is off. Turn it on in Settings.');
		}
		return await Location.getCurrentPosition();
	});

	<section>
		@try {
			<p>{`${where.coords.latitude.toFixed(5)}, ${where.coords.longitude.toFixed(5)}`}</p>
		} @pending {
			<p>Finding your location…</p>
		} @catch (error, reset) {
			<div>
				<p>{error.message}</p>
				<button onClick={() => Linking.openSettings()}>Open Settings</button>
				<button onClick={reset}>Try again</button>
			</div>
		}
	</section>
}
```
