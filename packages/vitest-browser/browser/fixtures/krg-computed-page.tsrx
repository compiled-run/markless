import { computed, state } from '@markless/core';
import { KrgItem } from './krg-family.tsrx';

// Defect 84, driven from a `computed()` instead of a handler write - the shape
// the combobox's filtered list actually has. The served set is the ONE row the
// opening query admits, so widening the query grows past every key that was
// served, and moving it sideways admits an unserved key while dropping the
// served one.
export default function KrgComputedPage() @{
	let query = state('c');
	const matched = computed(() =>
		[
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
			{ id: 'd', label: 'delta' },
		].filter((item) => item.label.startsWith(query)),
	);

	<section data-krg-computed-page>
		<button type="button" data-krg-all onClick={() => query = ''}>all</button>
		<button type="button" data-krg-only-delta onClick={() => query = 'd'}>only delta</button>
		<button type="button" data-krg-none onClick={() => query = 'zz'}>none</button>
		<button type="button" data-krg-restore onClick={() => query = 'c'}>restore</button>
		<output data-krg-count>{matched.length}</output>
		<ul data-krg-plain-list>
			@for (const item of matched; key item.id) {
				<li data-krg-plain-row data-krg-value={item.label}>{item.label}</li>
			}
		</ul>
		<div data-krg-widget-list>
			@for (const item of matched; key item.id) {
				<KrgItem value={item.label}>{item.label}</KrgItem>
			}
		</div>
	</section>
}
