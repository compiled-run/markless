import { state } from '@markless/core';
import { ratinggroup } from '../../index.ts';

// The consumer's own handler, logged so the suite can read what it was called
// with and how often. The group is controlled: nothing fills until the number
// comes back in.
export function WithOnChange() @{
	let rated = state(0);
	let calls = state(0);

	<section>
		<ratinggroup.root
			data-testid="root"
			value={rated}
			onChange={(next: number) => {
				rated = next;
				calls = calls + 1;
			}}
		>
			<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
			<Stars />
		</ratinggroup.root>
		<output data-testid="value">{rated}</output>
		<output data-testid="calls">{calls}</output>
	</section>
}

function Stars() @{
	const rating = ratinggroup.state();

	<div data-testid="stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="star" />
		}
	</div>
}
