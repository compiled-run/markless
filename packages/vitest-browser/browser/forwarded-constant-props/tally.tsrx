import { computed, state } from '@markless/core';

export function Tally({ items }: { readonly items: ReadonlyArray<string> }) @{
	const seen = state({ count: 0 });
	const label = computed(() => items.length + ' items, ' + seen.count + ' clicks');
	<button type="button" data-tally onClick={() => { seen.count = seen.count + 1; }}>{label}</button>
}
