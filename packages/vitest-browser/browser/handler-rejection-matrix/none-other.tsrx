import { computed } from '@markless/core';
import { Saver } from './saver.tsrx';
import { loadThing } from './api.ts';

export function NoneOther() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<Saver />
	</main>
}
