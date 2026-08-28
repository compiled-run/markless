import { rating } from '../../index.ts';

// Two groups on one page, one of them ten marks long. Each root is its own
// instance boundary, so rating one must leave the other exactly where it was.
export function TwoGroups() @{
	<section>
		<rating.root data-testid="left-root" name="stay">
			<rating.label data-testid="left-label">The stay</rating.label>
			<LeftStars />
		</rating.root>
		<rating.root data-testid="right-root" count={10} defaultValue={7} name="host">
			<rating.label data-testid="right-label">The host</rating.label>
			<RightStars />
		</rating.root>
	</section>
}

function LeftStars() @{
	const group = rating.state();

	<div data-testid="left-stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="left-star" />
		}
	</div>
}

function RightStars() @{
	const group = rating.state();

	<div data-testid="right-stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="right-star" />
		}
	</div>
}
