import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const pages = { 1: ['a', 'b'], 2: ['c', 'd'], 3: ['e'] } as Record<number, string[]>;

export function Pager() @{
	let page = state(1);
	const rows = computed(async () => answer(`rows:${page}`, { items: pages[page] ?? [], count: 3 }));

	<main>
		@try {
			<section>
				<p data-where>Page {page} of {rows.count}</p>
				<p data-items>{rows.items.join(',')}</p>
				<button type="button" data-next onClick={() => (page = page + 1)}>Next: page {page} of {rows.count}</button>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
