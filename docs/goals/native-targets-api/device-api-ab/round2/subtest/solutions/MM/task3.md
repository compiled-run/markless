```tsrx
// file: task3/LiveMap.tsrx
import { location, mapview } from '@markless/device';

export default function LiveMap() @{
	const me = location();
	const map = mapview({ zoom: 15 });

	<section>
		<mapview el={map}>
			@if (me.position) {
				<map.pin at={me.position} />
			}
		</mapview>
		@if (me.denied) {
			<p>Location access is off.</p>
		}
	</section>
}
```
