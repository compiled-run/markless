import { computed, state } from '@markless/core';
import Price from './Price.tsrx';

export default function Wrapper() @{
	let run = state(0);
	const runs = computed(() => [run]);

	<div>
		<button id="restart" onClick={() => run++}>restart</button>
		@for (const item of runs; key item) {
			<Price />
		}
	</div>
}
