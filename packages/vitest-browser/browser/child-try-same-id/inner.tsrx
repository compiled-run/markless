import { computed, state } from '@markless/core';
import { answer } from './answers.ts';

export default function Inner() @{
	let round = state(1);
	const inner = computed(async () => await answer(round % 2 === 0 ? null : `inner ${round}`));

	<section>
		<button type="button" data-inner-more onClick={() => round++}>Inner</button>
		@try {
			@if (inner) {
				<p data-inner>{inner}</p>
			} @else {
				<p data-inner>none</p>
			}
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
