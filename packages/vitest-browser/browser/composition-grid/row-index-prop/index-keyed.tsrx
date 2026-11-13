import { state } from '@markless/core';
import PlaceLine from './place-line.tsrx';

export default function IndexKeyed() @{
	let names = state(['x', 'y']);
	<section>
		<button data-front onClick={() => (names = ['w', ...names])}>front</button>
		<button data-drop onClick={() => (names = names.slice(1))}>drop</button>
		@for (const name of names; index n; key n) {
			<PlaceLine label={name} place={n + 1} />
		}
	</section>
}
