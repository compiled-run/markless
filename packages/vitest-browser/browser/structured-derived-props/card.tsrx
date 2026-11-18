import { computed, state } from '@markless/core';

export function Card({ item }: { readonly item: { readonly id: number; readonly title: string; readonly tags: ReadonlyArray<string>; readonly note: string } }) @{
	const seen = state({ count: 0 });
	const label = computed(() => item.title + ' [' + item.tags.join('+') + '] ' + seen.count);
	<button type="button" data-card={item.id} onClick={() => { seen.count = seen.count + 1; }}>{label}</button>
}
