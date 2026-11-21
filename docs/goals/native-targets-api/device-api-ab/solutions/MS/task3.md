```tsrx
import { location, settings } from '@markless/device';

export default function WhereAmI() @{
	const where = location();
	const phoneSettings = settings();

	<section>
		@if (where.status === 'denied') {
			<div>
				<p>Location access is off. Turn it on in Settings.</p>
				<button onClick={() => phoneSettings.open()}>Open Settings</button>
				<button onClick={() => where.refresh()}>Try again</button>
			</div>
		} @else {
			<p>{where.position ? `${where.position.latitude.toFixed(5)}, ${where.position.longitude.toFixed(5)}` : 'Finding your location…'}</p>
		}
	</section>
}
```
