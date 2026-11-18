import { computed } from '@markless/core';
import { loadItems } from '../mutations-refresh/server.ts';

export function SeveralForms() @{
	const shelf = computed(async () => await loadItems());

	<main>
		<header>
			@try {
				<form method="post" action="/mut/items" data-add>
					<input data-title name="title" autocomplete="off" />
				</form>
			} @catch (error) {
				<p data-add-failed>{error.message}</p>
			}
		</header>
		@try {
			<>
				<p data-names>{shelf.items.join(', ')}</p>
				<form method="post" action="/mut/star" data-star>
					<button name="on" value="yes" data-star-submit>Star</button>
				</form>
				<form method="post" action="/mut/pin" data-pin>
					<button name="on" value={shelf.items.length > 1 ? 'many' : 'one'} data-pin-submit>Pin</button>
				</form>
				<form method="post" action="/mut/flag" data-flag hidden={shelf.items.length === 0}>
					<button name="on" value="yes" data-flag-submit>Flag</button>
				</form>
			</>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
