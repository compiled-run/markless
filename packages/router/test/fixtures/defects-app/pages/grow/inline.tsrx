import { state } from '@markless/core';
import { NameList } from '../../src/name-list.tsrx';

const ALL = [
	{ id: 'a', name: 'Ada' },
	{ id: 'b', name: 'Brian' },
	{ id: 'c', name: 'Cleo' },
	{ id: 'd', name: 'Dora' },
];

export default function GrowInline() @{
	let count = state(2);
	<main>
		<button type="button" data-more onClick={() => count++}>
			more
		</button>
		<NameList items={ALL.slice(0, count)} />
	</main>;
}
