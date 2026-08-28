import { rating } from '../../index.ts';

// A group nobody may touch: out of the tab order, and every gesture ignored.
export function Disabled() @{
	<rating.root data-testid="root" disabled defaultValue={2}>
		<rating.label data-testid="label">Overall rating</rating.label>
		<Stars />
	</rating.root>
}

function Stars() @{
	const group = rating.state();

	<div data-testid="stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="star" />
		}
	</div>
}
