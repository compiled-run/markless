import { computed, state } from '@markless/core';
import { loadRows, saveFavorite } from './server.ts';

function Star({ saved }: { saved: boolean }) @{
	let sending = state<boolean | null>(null);
	const on = computed(() => sending ?? saved);

	<button
		type="button"
		data-star
		onClick={async () => {
			const next = !on;
			sending = next;
			try {
				await saveFavorite(next);
			} finally {
				sending = null;
			}
		}}
	>
		{on ? '★' : '☆'}
	</button>
}

export default function StarList() @{
	const data = computed(async () => await loadRows());

	@try {
		<ul>
			@for (const row of data.rows; key row.id) {
				<li><Star saved={row.favorite} /></li>
			}
		</ul>
	} @pending {
		<p>Loading</p>
	}
}
