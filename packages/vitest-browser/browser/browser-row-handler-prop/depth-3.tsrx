import { computed, state } from '@markless/core';
import Outer from './Outer.tsrx';

export default function Depth3() @{
	let run = state(0);
	const runs = computed(() => [run]);

	<main>
		<button id="restart" onClick={() => run++}>restart</button>
		@for (const item of runs; key item) {
			<Outer />
		}
	</main>
}
