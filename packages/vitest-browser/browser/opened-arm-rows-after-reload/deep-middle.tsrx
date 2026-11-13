import { computed, state } from '@markless/core';
import Derived from './derived.tsrx';
import { sizeOf } from './api.ts';

export default function DeepMiddle({ items, count }: { items: Array<{ id: string; text: string }>; count: number }) @{
	let inner = state(true);
	const sized = computed(async () => await sizeOf(count));

	<section>
		<button data-inner onClick={() => (inner = !inner)}>inner</button>
		@if (inner) {
			<article>
				<p data-count>{count}</p>
				@if (count > 3) {
					<b data-size>many</b>
				} @else {
					<b data-size>few</b>
				}
				<Derived items={items} />
				@try {
					<i data-sized>{sized}</i>
				} @pending {
					<i data-sized>sizing</i>
				}
			</article>
		}
	</section>
}
