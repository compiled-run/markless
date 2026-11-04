import { state } from '@markless/core';
import NestedList from './nested-list.tsrx';

export function NestedKeyedComputedPage() @{
	let open = state(false);

	<main>
		<button type="button" data-unrelated onClick={() => (open = !open)}>Unrelated</button>
		@if (open) {
			<p data-open>open</p>
		}
		<NestedList />
	</main>
}
