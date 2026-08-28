import { rating } from '../../index.ts';

// A group that already holds a rating, with the help text a form gives.
export function Prefilled() @{
	<rating.root data-testid="root" defaultValue={3}>
		<rating.label data-testid="label">Overall rating</rating.label>
		<rating.description data-testid="description">Rate the stay from one to five.</rating.description>
		<Stars />
		<rating.valuelabel data-testid="valuelabel" />
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
