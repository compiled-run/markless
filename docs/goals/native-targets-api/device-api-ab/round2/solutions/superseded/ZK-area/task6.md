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
import { map } from '@markless/device';
import type { PageProps } from '@markless/router';
import { placeFrom, spots, type Spot } from './places.ts';

export default function MapPage({ url }: PageProps) @{
	const m = map({ center: placeFrom(url.search) ?? spots[0].at, zoom: 13 });
	let chosen = state<Spot | null>(null);

	<main>
		<m.area>
			@for (const spot of spots; key spot.name) {
				<m.pin at={spot.at} onPress={() => (chosen = spot)} />
			}
		</m.area>
		<map.trigger of={m}>Recenter on me</map.trigger>
		@if (m.denied) {
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
