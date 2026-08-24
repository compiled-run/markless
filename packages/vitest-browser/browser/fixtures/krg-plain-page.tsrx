import { element, state } from '@markless/core';

// The control for the handler page: the SAME source and the same three writes,
// with one plain-row list and no widget rows anywhere. What this page can do and
// the two-list page cannot is attributable to the widget row root.
export default function KrgPlainPage() @{
	let shown = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);
	const rowEls = element<HTMLLIElement[]>();

	<section data-krg-plain-page>
		<button type="button" data-krg-grow onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
			{ id: 'd', label: 'delta' },
		]}>grow</button>
		<button type="button" data-krg-shrink onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
		]}>shrink</button>
		<button type="button" data-krg-swap onClick={() => shown = [
			{ id: 'b', label: 'bravo' },
			{ id: 'd', label: 'delta' },
		]}>swap</button>
		<ul data-krg-plain-list>
			@for (const item of shown; key item.id) {
				<li data-krg-plain-row data-krg-value={item.label} el={rowEls}>{item.label}</li>
			}
		</ul>
	</section>
}
