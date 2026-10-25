import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

export default function AsyncItem({ id }: { readonly id: number }) @{
	const item = computed(async () => slow({ title: `item ${id}` }, 50));
	<div class="row">
		@try {
			<span>{item.title}</span>
		} @pending {
			<span>loading {id}</span>
		} @catch {
			<span>failed</span>
		}
	</div>
}
