import { computed, state } from '@markless/core';

export function Tile({ side, title }: { readonly side: string; readonly title: string }) @{
	const picked = state({ value: '' });
	const caption = computed(() => title + ' ' + side + ' -> ' + picked.value);
	<button type="button" data-pick={title + '-' + side} onClick={() => { picked.value = title + ':' + side; }}>{caption}</button>
}
