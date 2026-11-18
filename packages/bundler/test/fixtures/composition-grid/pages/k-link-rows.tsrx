import { computed, state } from '@markless/core';
import { Link } from '@markless/router';
import { loadBoard } from '../../../../../vitest-browser/browser/composition-grid/grid-server.ts';

function Item({ slug }: { slug: string }) @{
	<li><Link data-g="row" href="/k-link-params/[id]/edit" params={{ id: slug }}>{slug}</Link></li>
}

// Rows keep their key across a reload while the value their <Link params> reads changes; the third load fails.
export default function Page() @{
	let round = state(0);
	const rows = computed(async () => {
		if (round === 2) throw new Error(`refused-${round}`);
		const board = await loadBoard('a', round);
		return board.items.map((item) => ({ id: item.id, slug: `${item.id}-${board.round}` }));
	});

	<main>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		@try {
			<ul>@for (const row of rows; key row.id) { <Item slug={row.slug} /> }</ul>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error) {
			<Link data-g="failed" href="/k-link-params/[id]/edit" params={{ id: error.message }}>{error.message}</Link>
		}
	</main>
}
