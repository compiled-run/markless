import { state } from '@markless/core';
import { NameList } from '../../src/name-list.tsrx';

const ALL = [
	{ id: 'a', name: 'Ada' },
	{ id: 'b', name: 'Brian' },
	{ id: 'c', name: 'Cleo' },
	{ id: 'd', name: 'Dora' },
];

export default function GrowState() @{
	let picked = state(ALL.slice(0, 2));
	<main>
		<button type="button" data-more onClick={() => (picked = ALL.slice(0, picked.length + 1))}>
			more
		</button>
		<NameList items={picked} />
	</main>;
}
