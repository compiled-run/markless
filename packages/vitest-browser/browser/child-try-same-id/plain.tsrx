import { state } from '@markless/core';

export default function Plain() @{
	let round = state(1);

	<section>
		<button type="button" data-inner-more onClick={() => round++}>Inner</button>
		@if (round % 2 === 1) {
			<p data-inner>inner {round}</p>
		} @else {
			<p data-inner>none</p>
		}
	</section>
}
