import { ratinggroup } from '../../index.ts';

// The display-only aggregate most rendered ratings are: still a rating a reader
// can read, and nothing a person does changes it.
export function ReadOnly() @{
	<ratinggroup.root data-testid="root" readonly half value={4.5}>
		<ratinggroup.label data-testid="label">Average guest rating</ratinggroup.label>
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
