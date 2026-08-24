import { element, state } from '@markless/core';
import { reportValues } from './aeh-report.ts';

// Rows, not hand-written parts: the same array-typed handle is bound on the row
// host of a keyed @for. The read has to answer whatever the rows ARE right now,
// so a reorder and a removal both have to show up without re-probing anything.
export default function AehRowsPage() @{
	let items = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'beta' },
		{ id: 'c', label: 'gamma' },
	]);
	let order = state('');
	const rowEls = element<HTMLLIElement[]>();

	<section data-aeh-rows-page data-order={order}>
		<button type="button" data-aeh-reorder onClick={() => items = [
			{ id: 'c', label: 'gamma' },
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'beta' },
		]}>reorder</button>
		<button type="button" data-aeh-remove onClick={() => items = [
			{ id: 'a', label: 'alpha' },
			{ id: 'c', label: 'gamma' },
		]}>remove</button>
		<button type="button" data-aeh-probe onClick={() => order = reportValues(rowEls)}>probe</button>
		<ul data-aeh-list>
			@for (const item of items; key item.id) {
				<li data-aeh-row data-aeh-value={item.label} el={rowEls}>{item.label}</li>
			}
		</ul>
	</section>
}
