import { state } from '@markless/core';

// A keyed list whose own keydown handler removes rows, with the handler above
// the list rather than on a row - the shape a calendar has, where the keys are
// the dates and a page key rewrites every row. Two presses with nothing between
// them means the second is aimed at a row the first one's write took out.
export default function DisposedRowDispatchPage() @{
	let rows = state(['alpha', 'bravo', 'charlie']);
	let steps = state(0);
	let picked = state('none');

	<section
		data-drd-page
		onKeydown={(event) => {
			if (event.key === 'PageDown') {
				const next = steps + 1;
				steps = next;
				rows = next === 1 ? ['alpha', 'bravo'] : ['alpha'];
			}
		}}
	>
		<div data-testid="list">
			@for (const row of rows; key row) {
				<button type="button" data-testid={row} value={row} onClick={() => picked = row}>
					{row}
				</button>
			}
		</div>
		<output data-testid="steps">{steps}</output>
		<output data-testid="count">{rows.length}</output>
		<output data-testid="picked">{picked}</output>
	</section>
}
