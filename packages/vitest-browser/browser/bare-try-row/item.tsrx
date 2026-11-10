import { computed } from '@markless/core';
import { loadDetail } from './api.ts';

// The row IS this bare @try: no element wraps it, so each row renders between row comments.
export function Item({ id }: { readonly id: string }) @{
	const detail = computed(async () => await loadDetail(id));

	@try {
		<li data-item={id}>{detail}</li>
	} @pending {
		<li data-loading={id}>Loading…</li>
	}
}
