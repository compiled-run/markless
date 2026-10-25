import { computed } from '@markless/core';
import { load } from './load.ts';

export default function RowShadowsAsyncPage() @{
	const list = computed(async () => load(['one', 'two']));
	const rows = computed(() => (Array.isArray(list) ? list : []).map((word, i) => ({ id: i, text: word })));
	const item = computed(async () => load({ text: 'the item' }, 60));

	<main>
		<ul>
			@try {
				@for (const item of rows; key item.id) {
					<li data-row>{item.text}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
		@try {
			<p data-item>{item.text}</p>
		} @pending {
			<p>pending</p>
		}
	</main>
}
