```ts
// file: task6/places.ts
import { map, type Place } from '@markless/device';

export interface Spot { name: string; at: Place }

export const spots: Spot[] = [
	{ name: 'Harbour Market', at: { latitude: 51.507, longitude: -0.127 } },
	{ name: 'Old Mill', at: { latitude: 51.515, longitude: -0.141 } },
	{ name: 'River Steps', at: { latitude: 51.501, longitude: -0.119 } },
];

export const cityMap = map.handle();
```

```tsrx
// file: task6/MapPage.tsrx
import { state } from '@markless/core';
import { map } from '@markless/device';
import { cityMap, spots, type Spot } from './places.ts';

export default function MapPage() @{
	let chosen = state<Spot | null>(null);

	<main>
		<map.root handle={cityMap} center={spots[0].at} zoom={13}>
			<map.area>
				@for (const spot of spots; key spot.name) {
					<map.item at={spot.at} onSelect={() => (chosen = spot)} />
				}
			</map.area>
			<map.trigger>Recenter on me</map.trigger>
			<map.error>
				<p>Location access is off.</p>
			</map.error>
		</map.root>
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
import { cityMap, spots } from './places.ts';

export default function SearchPage() @{
	let query = state('');
	const results = computed(() => spots.filter((spot) => spot.name.toLowerCase().includes(query.toLowerCase())));

	<main>
		<input type="search" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<ul>
			@for (const spot of results; key spot.name) {
				<li>
					<button
						onClick={async () => {
							cityMap.moveTo(spot.at);
							await navigate('/map');
						}}
					>
						{spot.name}
					</button>
				</li>
			}
		</ul>
	</main>
}
```
