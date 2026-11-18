import { computed, state } from '@markless/core';
import Shell from './Shell.tsrx';

export default function Depth2() @{
	let run = state(0);
	const runs = computed(() => [run]);

	<main>
		<button id="restart" onClick={() => run++}>restart</button>
		@for (const item of runs; key item) {
			<Shell />
		}
	</main>
}
