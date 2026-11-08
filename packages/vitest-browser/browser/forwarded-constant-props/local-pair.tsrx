import { computed, state } from '@markless/core';

export function Panel({ caption }: { readonly caption: string }) @{
	<div><Toggle side="dark" label={caption} /><Toggle side="light" label={caption} /></div>
}

function Toggle({ side, label }: { readonly side: string; readonly label: string }) @{
	const picked = state({ value: '' });
	const text = computed(() => label + ' ' + side + ' -> ' + picked.value);
	<button type="button" data-pick={label + '-' + side} onClick={() => { picked.value = label + ':' + side; }}>{text}</button>
}
