import { state } from '@markless/core';

export function Cell({ group, item }: { readonly group: { readonly name: string }; readonly item: string }) @{
	const seen = state({ text: '' });
	<div>
		<button data-cell={group.name + '-' + item} onClick={() => (seen.text = 'cell:' + group.name + '-' + item)}>c</button>
		<span data-seen={group.name + '-' + item}>{seen.text}</span>
	</div>
}
