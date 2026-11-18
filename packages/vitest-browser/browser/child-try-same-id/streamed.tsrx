import { computed, state } from '@markless/core';
import { answer, later } from './answers.ts';
import Plain from './plain.tsrx';

export default function Streamed() @{
	let round = state(1);
	const outer = computed(async () => await later(await answer(round % 2 === 0 ? null : `outer ${round}`)));

	<article>
		<button type="button" data-outer-more onClick={() => round++}>Outer</button>
		@try {
			<div>
				<Plain />
				@if (outer) {
					<p data-outer>{outer}</p>
				} @else {
					<p data-outer>none</p>
				}
			</div>
		} @pending {
			<p data-shelf-loading>Loading</p>
		}
	</article>
}
