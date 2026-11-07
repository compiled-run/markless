import { computed } from '@markless/core';
import { loadDetail } from './api.ts';

// Focus kept inside a row across a refresh: a sibling row added to the list must not disturb this row's own range.
export function FocusItem({ id }: { readonly id: string }) @{
	const detail = computed(async () => await loadDetail(id));

	@try {
		<li data-focus-item={id}>
			<input data-focus-input={id} />
			<span data-focus-detail={id}>{detail}</span>
		</li>
	} @pending {
		<li data-focus-loading={id}>Loading…</li>
	}
}
