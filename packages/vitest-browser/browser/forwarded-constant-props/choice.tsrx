import { computed, state } from '@markless/core';

export function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	const label = computed(() => name + ' ' + to + ' -> ' + page.last);
	<button type="button" data-pick={name + '-' + to} onClick={() => { page.last = name + ':' + to; }}>{label}</button>
}
