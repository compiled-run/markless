import { computed } from '@markless/core';
import { Wrapper } from './wrapper.tsrx';
import { loadThing } from './api.ts';

export function AroundDeep() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<div>
				<p data-loads>loads {thing.loads}</p>
				<Wrapper />
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error, reset) {
			<>
				<p data-caught>caught: {error.message}</p>
				<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
			</>
		}
	</main>
}
