import { computed } from '@markless/core';
import { loadItems } from '../src/items.ts';

export default function List() @{
	const items = computed(async () => await loadItems());

	<main data-page="list">
		<input data-field aria-label="Note" />
		<a data-to-other href="/other">to the other page</a>
		@try {
			<p data-run>{String(items.run)}</p>
		} @pending {
			<p data-pending>pending</p>
		} @catch {
			<p data-failed>failed</p>
		}
		<div style="height: 3000px">spacer</div>
		<p data-bottom>bottom</p>
	</main>
}
