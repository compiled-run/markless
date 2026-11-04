import { state } from '@markless/core';

export function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" data-pick={name + '-' + to} onClick={() => { page.last = name + ':' + to; }}>{name + ' ' + to + ' -> ' + page.last}</button>
}
