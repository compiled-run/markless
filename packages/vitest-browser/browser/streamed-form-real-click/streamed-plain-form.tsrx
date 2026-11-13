import { computed } from '@markless/core';
import { loadItems, server } from '../mutations-refresh/server.ts';

const wait = (ms: number) => new Promise((settle) => setTimeout(settle, ms));

export default function StreamedPlainForm() @{
	const shelf = computed(async () => {
		await wait(20);
		return await loadItems();
	});
	// The browser's own run waits at the test's gate, so the streamed arm lands first.
	const later = computed(async () => {
		await (typeof window === 'undefined' ? wait(150) : server.lateGate);
		return 'ready';
	});

	<main>
		<form method="post" action="/mut/items" data-outside-form>
			<input data-outside-field name="outside" />
			<button type="submit" data-outside-submit>Add outside</button>
		</form>
		@try {
			<section>
				<form method="post" action="/mut/items" data-form>
					<input data-field name="name" />
					<button type="submit" data-submit>Add</button>
				</form>
				<form method="post" action="/mut/items" data-second-form>
					<input data-second-field name="second" />
					<button type="submit" data-second-submit>Add second</button>
				</form>
				<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
		@try {
			<p data-later>{later}</p>
		} @pending {
			<p data-later-pending>later</p>
		}
	</main>
}
