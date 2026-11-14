import { computed, state } from '@markless/core';
import { answer } from './answers.ts';
import Inner from './inner.tsrx';

export default function Outer() @{
	let round = state(1);
	const outer = computed(async () => await answer(round % 2 === 0 ? null : `outer ${round}`));

	<article>
		<button type="button" data-outer-more onClick={() => round++}>Outer</button>
		@try {
			<div>
			<Inner />
			@if (outer) {
				<p data-outer>{outer}</p>
			} @else {
				<p data-outer>none</p>
			}
			</div>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
