import { computed, state } from '@markless/core';
import Pager from './pager.tsrx';

export default function PagerPage() @{
	let reload = state(0);
	let run = state(0);
	const runs = computed(() => [{ run, reload }]);

	<main>
		<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
		@for (const item of runs; key item.run) {
			<Pager reload={item.reload} />
		}
	</main>
}
