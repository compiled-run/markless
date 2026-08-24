import { computed, state } from '@markless/core';

// The same mintable row shape, driven from a `computed()` rather than a handler
// write - the shape the combobox's filtered list actually has. The served set is
// the ONE row the opening query admits, so widening the query grows past every
// key that was served, and moving it sideways admits an unserved key while
// dropping the served one.
//
// The list carries a static sibling in front of the rows and an `@empty` arm
// after them, so a mint has to land in the row span and take the arm the client
// itself raised back out.
export default function KrgMintComputedPage() @{
	let query = state('c');
	const matched = computed(() =>
		[
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
			{ id: 'd', label: 'delta' },
		].filter((item) => item.label.startsWith(query)),
	);

	<section data-krg-mint-computed-page>
		<button type="button" data-krg-all onClick={() => query = ''}>all</button>
		<button type="button" data-krg-only-delta onClick={() => query = 'd'}>only delta</button>
		<button type="button" data-krg-none onClick={() => query = 'zz'}>none</button>
		<button type="button" data-krg-restore onClick={() => query = 'c'}>restore</button>
		<output data-krg-count>{matched.length}</output>
		<ul data-krg-mint-list>
			<li data-krg-mint-header>header</li>
			@for (const item of matched; key item.id) {
				<li data-krg-mint-row><span data-krg-mint-label>{item.label}</span></li>
			} @empty {
				<li data-krg-mint-empty>nothing matches</li>
			}
		</ul>
		<p data-krg-mint-tail>tail</p>
	</section>
}
