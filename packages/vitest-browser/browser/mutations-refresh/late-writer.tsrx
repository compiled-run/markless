import { computed } from '@markless/core';
import { addItem, loadItems, server, waitInHandler } from './server.ts';

async function stampVisit(): Promise<string> {
	await Promise.resolve();
	await server.lateGate;
	await fetch('/mut/visits', { method: 'POST', body: 'visit' });
	return 'stamped';
}

// An async value that sends a write after an await: the write watch cannot see it was the recipe's.
export function LateWriter() @{
	const shelf = computed(async () => await loadItems());
	const stamp = computed(async () => await stampVisit());

	<main>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
		<button type="button" data-slow onClick={async () => await waitInHandler()}>Wait</button>
		@try {
			<section>
				<p data-names>{shelf.items.join(', ')}</p>
				<p data-stamp>{stamp}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
