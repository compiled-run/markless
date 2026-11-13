import { computed } from '@markless/core';
import { Wrapper } from './wrapper.tsrx';
import { loadThing } from './api.ts';

export function NoneDeep() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<Wrapper />
	</main>
}
