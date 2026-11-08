import { computed, state } from '@markless/core';

export default function Facets() @{
	let mounted = state(true);
	let chosen = state<ReadonlyArray<string>>([]);
	const view = computed(() => ({ chosen, count: chosen.length }));
	<section>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Status</button>
		<output data-chosen>{view.count}</output>
		@if (mounted) {
			<div role="listbox" data-list>
				<div role="option" data-option="todo" data-checked={view.chosen.includes('todo') ? 'true' : 'false'} onClick={() => chosen = view.chosen.includes('todo') ? [] : ['todo']}>Todo</div>
				@if (view.count > 0) {
					<div role="option" data-clear onClick={() => chosen = []}>Clear filters</div>
				}
			</div>
		}
	</section>
}
