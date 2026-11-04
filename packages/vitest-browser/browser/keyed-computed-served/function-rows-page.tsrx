import { computed, state } from '@markless/core';

export function FunctionRowsPage() @{
	const list = state({ query: 'a', rows: [{ id: 'f1', label: 'alpha' }, { id: 'f2', label: 'beta' }] });
	const shown = computed(() =>
		list.rows.filter((row) => row.label.includes(list.query)).map((row) => ({ ...row, shout: () => row.label.toUpperCase() })),
	);

	<main>
		<button type="button" data-fn-narrow onClick={() => (list.query = 'et')}>Narrow</button>
		<ul>
			@for (const row of shown; key row.id) {
				<li data-fn-row={row.id}>{row.label}</li>
			}
		</ul>
	</main>
}
