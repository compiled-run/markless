import { state } from '@markless/core';

// The combobox's shape: the repeat's parent holds a sibling element BEFORE the
// rows, and an `@empty` arm after them. Rows are therefore not the parent's
// first child elements, which is the one assumption the resume reconcile makes
// about where a row lives.
export default function KrgSiblingPage() @{
	let shown = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	<section data-krg-sibling-page>
		<button type="button" data-krg-shrink onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'c', label: 'charlie' },
		]}>shrink</button>
		<button type="button" data-krg-none onClick={() => shown = []}>none</button>
		<ul data-krg-plain-list>
			<li data-krg-header>header</li>
			@for (const item of shown; key item.id) {
				<li data-krg-plain-row data-krg-value={item.label}>{item.label}</li>
			} @empty {
				<li data-krg-empty>nothing</li>
			}
		</ul>
	</section>
}
