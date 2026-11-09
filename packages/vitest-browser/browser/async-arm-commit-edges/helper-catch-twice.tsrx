import { computed, state } from '@markless/core';
import { tally } from './gated.ts';

function Meter({ name, step }: { name: string; step: number }) @{
	const reading = computed(async () => await tally(name, step));
	<div data-meter={name}>
		@try {
			<span data-reading>{name}: {reading}</span>
		} @catch (problem) {
			<em data-problem>{String(problem)}</em>
		}
	</div>
}

export default function HelperCatchTwice() @{
	let step = state(0);
	<section>
		<button data-again onClick={() => step++}>again</button>
		<Meter name="gas" step={step} />
		<Meter name="water" step={step} />
	</section>
}
