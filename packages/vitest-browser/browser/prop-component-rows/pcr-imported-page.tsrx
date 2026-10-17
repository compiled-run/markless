import { state } from '@markless/core';
import { TitleList } from './pcr-list.tsrx';

type Row = { id: string; title: string };

export default function ImportedRowsPage() @{
	let titles = state([{ id: 'x', title: 'X' }] as Row[]);
	<section>
		<button
			type="button"
			data-add-title
			onClick={() => (titles = [...titles, { id: String(titles.length), title: `e${titles.length}` }])}
		>
			add
		</button>
		<TitleList rows={titles} />
		<ol data-slot-rows>
			@for (const row of titles; key row.id) {
				<li data-long={row.title.length > 1 ? 'yes' : 'no'}>{row.title}</li>
			}
		</ol>
	</section>
}
