import { state } from '@markless/core';
import { TitleList } from '../src/title-list.tsrx';

type Row = { id: string; title: string };

export default function ListRowsPage() @{
	let titles = state([{ id: 'x', title: 'X' }] as Row[]);
	let rows = state([
		{ id: 'a', on: false },
		{ id: 'b', on: false },
	]);
	<main>
		<button
			type="button"
			data-add-title
			onClick={() =>
				(titles = [...titles, { id: String(titles.length), title: `E${titles.length}` }])
			}
		>
			add
		</button>
		<TitleList rows={titles} />
		<button
			type="button"
			data-flip
			onClick={() => (rows = rows.map((r) => ({ ...r, on: !r.on })))}
		>
			flip
		</button>
		<button type="button" data-reverse onClick={() => (rows = [...rows].reverse())}>
			reverse
		</button>
		<ul data-attr-rows>
			@for (const r of rows; key r.id) {
				<li data-on={r.on ? 'yes' : 'no'}>{r.id}</li>;
			}
		</ul>
	</main>;
}
