import { computed, state } from '@markless/core';
import { loadContact, saveFavorite } from './server.ts';

export default function FavoritePage() @{
	const contact = computed(async () => loadContact());
	let pendingFavorite = state<boolean | null>(null);

	<main>
		@try {
			<section>
			<h1>{contact.name}</h1>
			<form
				method="post"
				onSubmit={async (event) => {
					event.preventDefault();
					const next = !(pendingFavorite ?? contact.favorite);
					pendingFavorite = next;
					try {
						await saveFavorite(next);
					} finally {
						if (pendingFavorite === next) pendingFavorite = null;
					}
				}}
			>
				<button name="favorite" value={(pendingFavorite ?? contact.favorite) ? 'false' : 'true'}>
					{(pendingFavorite ?? contact.favorite) ? '★' : '☆'}
				</button>
			</form>
			</section>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p data-error>{error.message}</p>
		}
	</main>
}
