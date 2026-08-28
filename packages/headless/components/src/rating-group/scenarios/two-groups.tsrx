import * as ratinggroup from '../index.ts';

// Two groups on one page, one of them ten marks long. Each root is its own
// instance boundary, so rating one must leave the other exactly where it was.
export function TwoGroups() @{
	<section>
		<ratinggroup.root data-testid="left-root" name="stay">
			<ratinggroup.label data-testid="left-label">The stay</ratinggroup.label>
			<LeftStars />
		</ratinggroup.root>
		<ratinggroup.root data-testid="right-root" count={10} defaultValue={7} name="host">
			<ratinggroup.label data-testid="right-label">The host</ratinggroup.label>
			<RightStars />
		</ratinggroup.root>
	</section>
}

function LeftStars() @{
	const rating = ratinggroup.state();

	<div data-testid="left-stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="left-star" />
		}
	</div>
}

function RightStars() @{
	const rating = ratinggroup.state();

	<div data-testid="right-stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="right-star" />
		}
	</div>
}
