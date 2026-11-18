import { computed, state } from '@markless/core';
import { like, loadShelf } from './server.ts';

export default function LikePage() @{
	const shelf = computed(async () => await loadShelf());
	let liking = state(false);

	<main>
		@try {
			<section>
				<button
					data-like
					onClick={async () => {
						liking = true;
						try {
							await like();
						} finally {
							liking = false;
						}
					}}
				>
					Like
				</button>
				<span data-likes>{shelf.likes + (liking ? 1 : 0)}</span>
				<span data-server>{shelf.likes}</span>
			
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
