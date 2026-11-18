import { computed } from '@markless/core';
import { loadItem } from './api.ts';

export default function Panel({ tag, id }: { tag: string; id: number }) @{
	const item = computed(async ({ signal }) => await loadItem(tag, id, signal));

	<section data-panel={tag}>
		@try {
			<p data-name>{item.name}</p>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
