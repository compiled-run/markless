import { computed, state } from '@markless/core';
import Watchlist from './watchlist.tsrx';

export default function WatchPage() @{
	let reload = state(0);
	let run = state(0);
	const runs = computed(() => [{ run, reload }]);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
		@for (const item of runs; key item.run) {
			<Watchlist reload={item.reload} />
		}
	</main>
}
