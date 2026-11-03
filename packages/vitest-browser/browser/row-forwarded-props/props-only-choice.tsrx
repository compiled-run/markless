import { state } from '@markless/core';

export function Plain({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-pick={name + '-' + to} data-last={page.last} onClick={() => { page.last = name + ':' + to; }}>{name + ' ' + to}</button>
}
