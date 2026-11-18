import { state } from '@markless/core';
import { Forecast } from './forecast.tsrx';
import { Middle } from './middle.tsrx';
import { Wrapped } from './wrapped.tsrx';

export default function ForRowTry() @{
	let cities = state([{ id: 1, name: 'Boston' }]);
	let later = state<{ id: number; name: string }[]>([]);

	<section>
		<ul data-list="cities">
			@for (const city of cities; key city.id) {
				<Forecast city={city.name} />
			}
		</ul>
		<ul data-list="later">
			@for (const city of later; key city.id) {
				<Forecast city={city.name} />
			}
		</ul>
		<ol data-list="wrapped">
			@for (const city of cities; key city.id) {
				<li data-wrapped={city.id}>
					<Wrapped label={city.name} />
				</li>
			}
		</ol>
		<ul data-list="middle">
			@for (const city of cities; key city.id) {
				<Middle label={city.name} />
			}
		</ul>
		<button data-add onClick={() => cities.push({ id: cities.length + 1, name: 'Oslo' })}>add</button>
		<button data-add-later onClick={() => later.push({ id: 1, name: 'Lima' })}>add later</button>
		<button data-drop onClick={() => cities.shift()}>drop</button>
	</section>
}
