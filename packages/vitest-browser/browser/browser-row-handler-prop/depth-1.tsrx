import { computed, state } from '@markless/core';
import List from './List.tsrx';

export default function Depth1() @{
	let run = state(0);
	const runs = computed(() => [run]);

	<main>
		<button id="restart" onClick={() => run++}>restart</button>
		@for (const item of runs; key item) {
			<List />
		}
	</main>
}
