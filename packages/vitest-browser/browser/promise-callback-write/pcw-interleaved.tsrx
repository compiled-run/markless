import { state } from '@markless/core';
import { later } from './pcw-later.ts';

export default function InterleavedPage() @{
	const view = state({ query: '', rows: [] as readonly string[], waiting: false });
	<section>
		<button
			type="button"
			data-load
			onClick={() => {
				later(['one', 'two']).then((rows) => {
					view.rows = rows.map((row) => row + ':' + view.query);
					view.waiting = false;
				});
			}}
		>
			load
		</button>
		<input
			data-query
			onInput={(event) => {
				view.query = (event.target as HTMLInputElement).value;
				view.waiting = view.rows.length === 0;
			}}
		/>
		<output data-waiting>{view.waiting ? 'waiting' : 'still'}</output>
		<ul data-list>
			@for (const row of view.rows; key row) {
				<li>{row}</li>
			}
		</ul>
	</section>
}
