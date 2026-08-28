import * as ratinggroup from '../index.ts';

// A group nobody may touch: out of the tab order, and every gesture ignored.
export function Disabled() @{
	<ratinggroup.root data-testid="root" disabled defaultValue={2}>
		<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
		<Stars />
	</ratinggroup.root>
}

function Stars() @{
	const rating = ratinggroup.state();

	<div data-testid="stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="star" />
		}
	</div>
}
