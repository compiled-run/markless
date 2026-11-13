import { computed, state } from '@markless/core';
import DeepMiddle from './deep-middle.tsrx';

export default function DeepTabs({ items }: { items: Array<{ id: string; text: string }> }) @{
	let outer = state(true);
	const count = computed(() => items.length);

	<div>
		<button data-close onClick={() => (outer = false)}>close</button>
		@if (outer) {
			<DeepMiddle items={items} count={count} />
		} @else {
			<p>closed</p>
		}
	</div>
}
