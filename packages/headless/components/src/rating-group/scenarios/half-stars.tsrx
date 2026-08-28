import { ratinggroup } from '../../index.ts';

// Half values: the near half of a mark is worth half of it, by pointer and by key.
export function HalfStars() @{
	<ratinggroup.root data-testid="root" half defaultValue={2.5}>
		<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
		<Stars />
		<ratinggroup.valuelabel data-testid="valuelabel" />
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
