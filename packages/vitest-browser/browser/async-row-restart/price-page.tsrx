import { computed, state } from '@markless/core';
import Price from './price.tsrx';

export default function PricePage() @{
	let run = state(0);
	const runs = computed(() => [run]);

	<main>
		<button data-restart onClick={() => run++}>restart</button>
		@for (const item of runs; key item) {
			<Price />
		}
	</main>
}
