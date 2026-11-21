```ts
// file: task6/places.ts
import type { Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export function placeFrom(search: string): Place | null {
	const query = new URLSearchParams(search);
	const latitude = query.get('lat');
	const longitude = query.get('lng');
	return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { device, type Place } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	let center = state<Place>(placeFrom(url.search) ?? spots[0].at);
	let chosen = state<Spot | null>(null);
	let denied = state(false);

	<main>
		<device.map center={center} zoom={13} onChange={(next) => (center = next)}>
			@for (const spot of spots; key spot.name) {
				<device.map.pin at={spot.at} onPress={() => (chosen = spot)} />
			}
		</device.map>
		<button
			onClick={async () => {
				try {
					center = await device.location.current();
				} catch (error) {
					denied = (error as Error).name === 'NotAllowedError';
				}
			}}
		>
			Recenter on me
		</button>
		@if (denied) {
			<p>Location access is off.</p>
		}
		@if (chosen) {
			<article>
				<h2>{chosen.name}</h2>
				<button onClick={() => (chosen = null)}>Close</button>
			</article>
		}
		<a href="/search">Search</a>
	</main>
}
```

```tsrx
// file: task6/SearchPage.tsrx
import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button onClick={() => navigate(`/map?lat=${spot.at.latitude}&lng=${spot.at.longitude}`)}>{spot.name}</button>
				</li>
			}
		</ul>
	</main>
}
```
