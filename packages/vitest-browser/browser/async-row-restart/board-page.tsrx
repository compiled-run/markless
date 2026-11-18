import { computed, state } from '@markless/core';
import Board from './board.tsrx';

export default function BoardPage() @{
	let run = state(0);
	let reload = state(0);
	const runs = computed(() => [{ run, reload }]);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<button data-restart onClick={() => { reload = 0; run++; }}>restart</button>
		@for (const item of runs; key item.run) {
			<Board reload={item.reload} />
		}
	</main>
}
