import { rating } from '../../index.ts';

// Half values: the near half of a mark is worth half of it, by pointer and by key.
export function HalfStars() @{
	<rating.root data-testid="root" half defaultValue={2.5}>
		<rating.label data-testid="label">Overall rating</rating.label>
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
