import { state } from '@markless/core';

type Item = { readonly id: string; readonly name: string };

const ALL: readonly Item[] = [
	{ id: 'a', name: 'Ada' },
	{ id: 'b', name: 'Brian' },
	{ id: 'c', name: 'Cleo' },
	{ id: 'd', name: 'Dora' },
];

function List({ items }: { readonly items: readonly Item[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.name}</li>;
		}
	</ul>;
}

export default function GrowSameModule() @{
	let count = state(2);
	<main>
		<button type="button" data-more onClick={() => count++}>
			more
		</button>
		<List items={ALL.slice(0, count)} />
	</main>;
}
