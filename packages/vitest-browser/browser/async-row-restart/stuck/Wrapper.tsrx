import { computed, state } from '@markless/core';
import Counter from './Counter.tsrx';
import { answerNext as land } from '../gate.ts';

export default function Wrapper({ name }: { name: string }) @{
	let run = state(0);
	let reload = state(0);
	const runs = computed(() => [{ run, reload }]);

	<section data-wrapper={name}>
		<button class="restart" onClick={() => { reload = 0; run++; }}>restart</button>
		<button class="land" onClick={() => land()}>land</button>
		@for (const item of runs; key item.run) {
			<Counter reload={item.reload} />
		}
	</section>
}
