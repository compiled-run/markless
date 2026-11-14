import { computed, state } from '@markless/core';
import { answer } from './answers.ts';
import Outer from './outer.tsrx';

export default function Top() @{
	let round = state(1);
	const top = computed(async () => await answer(round % 2 === 0 ? null : `top ${round}`));

	<main>
		<button type="button" data-top-more onClick={() => round++}>Top</button>
		@try {
			<div>
				<Outer />
				@if (top) {
					<p data-top>{top}</p>
				} @else {
					<p data-top>none</p>
				}
			</div>
		} @pending {
			<p data-loading>Loading</p>
		}
	</main>
}
