import { ratinggroup } from '../../index.ts';

// A group that already holds a rating, with the help text a form gives.
export function Prefilled() @{
	<ratinggroup.root data-testid="root" defaultValue={3}>
		<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
		<ratinggroup.description data-testid="description">Rate the stay from one to five.</ratinggroup.description>
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
