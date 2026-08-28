import { state } from '@markless/core';
import { rating } from '../../index.ts';

// The consumer's own handler, logged so the suite can read what it was called
// with and how often. The group is controlled: nothing fills until the number
// comes back in.
export function WithOnChange() @{
	let rated = state(0);
	let calls = state(0);

	<section>
		<rating.root
			data-testid="root"
			value={rated}
			onChange={(next: number) => {
				rated = next;
				calls = calls + 1;
			}}
		>
			<rating.label data-testid="label">Overall rating</rating.label>
			<Stars />
		</rating.root>
		<output data-testid="value">{rated}</output>
		<output data-testid="calls">{calls}</output>
	</section>
}

function Stars() @{
	const group = rating.state();

	<div data-testid="stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="star" />
		}
	</div>
}
