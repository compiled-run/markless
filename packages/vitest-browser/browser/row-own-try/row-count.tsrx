import { computed } from '@markless/core';
import { getCount } from './gate.ts';

export function RowCount({ id, name }: { id: number; name: string }) @{
	const count = computed(async () => await getCount(id));

	@try {
		<b data-count>{name}: {count}</b>
	} @pending {
		<i data-count-loading>…</i>
	}
}
