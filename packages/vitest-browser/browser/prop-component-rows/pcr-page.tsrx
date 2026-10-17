import { computed, state } from '@markless/core';
import { TitleList } from './pcr-list.tsrx';

type Row = { id: string; title: string };

function LocalList({ rows }: { readonly rows: readonly Row[] }) @{
	<ol data-local-rows>
		@for (const row of rows; key row.id) {
			<LocalItem row={row} />
		}
	</ol>
}

function LocalItem({ row }: { readonly row: Row }) @{
	<li>{row.title}</li>
}

export default function Page() @{
	let titles = state([{ id: 'x', title: 'X' }] as Row[]);
	const upper = computed(() => titles.map((row) => ({ id: row.id, title: row.title.toUpperCase() })));
	<section>
		<button
			type="button"
			data-add-title
			onClick={() => (titles = [...titles, { id: String(titles.length), title: `e${titles.length}` }])}
		>
			add
		</button>
		<TitleList rows={titles} />
		<LocalList rows={titles} />
		<ul data-computed-rows>
			@for (const row of upper; key row.id) {
				<LocalItem row={row} />
			}
		</ul>
	</section>
}
