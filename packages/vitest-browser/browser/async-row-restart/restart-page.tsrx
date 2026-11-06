import { computed, state } from '@markless/core';
import Counter from './counter.tsrx';

export default function RestartPage() @{
	let run = state(0);
	let reload = state(0);
	const runs = computed(() => [{ run, reload }]);

	<main>
		<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
		<button data-reload onClick={() => reload++}>reload</button>
		@for (const item of runs; key item.run) {
			<Counter reload={item.reload} />
		}
	</main>
}
