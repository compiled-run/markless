import { state } from '@markless/core';
import { table } from '../../index.ts';

/**
 * The acceptance test the charter sets: a table row model of the shape a data
 * library hands out drives this family directly, with nothing in between.
 *
 * `headers` is a header group - each entry knowing its own column id and whether
 * that column can be sorted - and `rows` is a row model, each row knowing its id
 * and its fields. Nothing here is a type this family invented, and the family is
 * told none of it: which parts to render is the page's `@if`, and the only
 * things that cross the boundary are strings and callbacks.
 *
 * The cells are written out rather than looped because a loop cannot open
 * directly inside a component tag, and a `<tr>` may hold nothing but cells to
 * open one in. A page with a variable column set puts the loop one component
 * deeper.
 *
 * The two shape differences a real data library has are both one expression
 * wide, and both are written out below rather than hidden: its picked set is a
 * record where this family's is an array, and its sort state is a list where
 * this family's is one descriptor.
 */
export default function RowModel() @{
	const headers = state([
		{ id: 'name', label: 'Name', sortable: false },
		{ id: 'size', label: 'Size', sortable: true },
		{ id: 'changed', label: 'Changed', sortable: true },
	]);
	const rows = state([
		{ id: 'readme', name: 'README.md', size: '4.1 kB', changed: 'Today' },
		{ id: 'license', name: 'LICENSE', size: '1.1 kB', changed: 'Last week' },
		{ id: 'changelog', name: 'CHANGELOG.md', size: '12.4 kB', changed: 'In March' },
	]);
	const log = state({ picked: [] as readonly string[], selection: '', column: '' });

	<section>
		<table.root
			multiple
			value={log.picked}
			sort={{ column: 'size', direction: 'ascending' }}
			data-testid="root"
			onChange={(next: readonly string[]) => {
				// A row-selection record out of the array this family reports.
				const rowSelection: Record<string, boolean> = Object.fromEntries(
					next.map((id) => [id, true]),
				);
				log.picked = next;
				log.selection = Object.keys(rowSelection).join(' ');
			}}
			onSortChange={(column: string) => {
				// Where a data library's own toggle handler goes: it owns the policy.
				log.column = column;
			}}
		>
			<caption>Files</caption>
			<thead>
				<tr data-testid="header-row">
					@for (const header of headers; key header.id) {
						@if (header.sortable) {
							<table.coltrigger
								value={header.id}
								data-testid="sortable-header"
							>{header.label}</table.coltrigger>
						} @else {
							<th data-testid="plain-header">{header.label}</th>
						}
					}
				</tr>
			</thead>
			<tbody>
				@for (const row of rows; key row.id) {
					<table.item value={row.id} data-testid="model-item">
						<table.rowcontent rowheader data-testid="model-cell">{row.name}</table.rowcontent>
						<table.rowcontent data-testid="model-cell">{row.size}</table.rowcontent>
						<table.rowcontent data-testid="model-cell">{row.changed}</table.rowcontent>
					</table.item>
				}
			</tbody>
		</table.root>
		<p data-testid="selection">{log.selection}</p>
		<p data-testid="column">{log.column}</p>
	</section>
}
