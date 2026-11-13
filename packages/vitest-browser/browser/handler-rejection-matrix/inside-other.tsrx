import { computed } from '@markless/core';
import { CaughtSaver } from './saver.tsrx';
import { loadThing } from './api.ts';

export function InsideOther() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<CaughtSaver />
	</main>
}
