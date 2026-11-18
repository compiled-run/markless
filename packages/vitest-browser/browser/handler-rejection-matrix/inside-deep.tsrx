import { computed } from '@markless/core';
import { CaughtWrapper } from './wrapper.tsrx';
import { loadThing } from './api.ts';

export function InsideDeep() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<CaughtWrapper />
	</main>
}
