import { computed } from '@markless/core';
import { addItem, loadItems, waitInHandler } from './server.ts';

export function Shelf() @{
	const shelf = computed(async () => await loadItems());

	<main>
		<input data-field />
		@try {
			<section data-shelf>
				<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
				<button type="button" data-add-two onClick={async () => await addItem('Linus')}>Add Linus</button>
				<button
					type="button"
					data-add-then-wait
					onClick={async () => {
						await addItem('Grace');
						await waitInHandler();
					}}
				>
					Add Grace, then wait
				</button>
				<button
					type="button"
					data-add-remote
					onClick={async () => void (await fetch('https://elsewhere.example/mut/items', { method: 'POST', body: 'Remote' }))}
				>
					Add on another site
				</button>
				<button
					type="button"
					data-add-request
					onClick={async () => void (await fetch(new Request('/mut/items', { method: 'POST', body: 'Ivy' })))}
				>
					Add Ivy with a Request
				</button>
				<button type="button" data-track onClick={() => void fetch('/mut/track', { method: 'POST', body: 'click' })}>
					Track
				</button>
				<button type="button" data-slow onClick={async () => await waitInHandler()}>Wait</button>
				<p data-names>{shelf.items.join(', ')}</p>
				<p data-run>{String(shelf.run)}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
