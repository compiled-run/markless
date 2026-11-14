import { computed, state } from '@markless/core';
import Oops from './k-oops.tsrx';

// The outer load fails twice in a row with different errors, then loads; the nested @try fails on every other press.
export default function CatchErrorCasesPage() @{
	let round = state(0);
	let innerRound = state(0);
	const loaded = computed(async () => {
		const at = round;
		if (at === 0) throw new TypeError(`first ${at}`);
		if (at === 1) throw new RangeError(`second ${at}`);
		return `found ${at}`;
	});
	const inner = computed(async () => {
		const at = innerRound;
		if (at % 2 === 1) throw new Error(`inner ${at}`);
		return `inner ok ${at}`;
	});

	<main>
		<button type="button" data-next onClick={() => (round += 1)}>next</button>
		<button type="button" data-inner onClick={() => (innerRound += 1)}>inner</button>
		@try {
			<>
				<p data-g="loaded">{loaded}</p>
				@try {
					<p data-g="inner">{inner}</p>
				} @catch (error) {
					<Oops message={error.message} />
				}
			</>
		} @catch (error) {
			<>
				<Oops message={error.name} />
				<Oops message={error.message} />
			</>
		}
	</main>
}
