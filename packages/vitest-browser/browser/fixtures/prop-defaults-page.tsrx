import { state } from '@markless/core';
import { Stars, Tags } from './prop-defaults.tsrx';

export default function PropDefaultsPage() @{
	const rating = state<{ n: number | undefined }>({ n: 1 });
	const rows = state<{ id: string; n?: number }[]>([{ id: 'a', n: 2 }, { id: 'b' }]);

	<section>
		<div data-case="omitted"><Stars /></div>
		<div data-case="undefined"><Stars size={undefined} /></div>
		<div data-case="passed"><Stars size={5} /></div>
		<div data-case="live"><Stars size={rating.n} /></div>
		<div data-case="tags-omitted"><Tags tags={['x', 'y', 'z']} /></div>
		<div data-case="tags-passed"><Tags tags={['a', 'b', 'c']} max={rating.n} /></div>
		<ul data-case="rows">
			@for (const row of rows; key row.id) {
				<li><Stars size={row.n} /></li>
			}
		</ul>
		<button type="button" data-more onClick={() => { rating.n = 6; rows[1].n = 1; }}>more</button>
		<button type="button" data-clear onClick={() => { rating.n = undefined; }}>clear</button>
	</section>
}
