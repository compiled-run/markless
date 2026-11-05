import { state } from '@markless/core';

const GROUPS = [
	{ name: 'a', items: ['x', 'y'] },
	{ name: 'b', items: ['x', 'y'] },
];

function Cell({ group, item }: { readonly group: { readonly name: string }; readonly item: string }) @{
	const seen = state({ text: '' });
	<div>
		<button data-cell={group.name + '-' + item} onClick={() => (seen.text = 'cell:' + group.name + '-' + item)}>c</button>
		<span data-seen={group.name + '-' + item}>{seen.text}</span>
	</div>
}

export default function NestedForPage() @{
	<div>
		@for (const group of GROUPS; key group.name) {
			@for (const item of group.items; key item) {
				<Cell group={group} item={item} />
			}
		}
	</div>
}
