import * as ratinggroup from '../index.ts';

// Help text and a validation message. The second group writes its error BEFORE
// the marks, because document order must not decide what the group describes
// itself with.
export function WithHelp() @{
	<section>
		<ratinggroup.root data-testid="after-root">
			<ratinggroup.label data-testid="after-label">Overall rating</ratinggroup.label>
			<ratinggroup.description data-testid="after-description">Rate the stay from one to five.</ratinggroup.description>
			<AfterStars />
			<ratinggroup.error data-testid="after-error">Give the stay a rating</ratinggroup.error>
		</ratinggroup.root>
		<ratinggroup.root data-testid="before-root">
			<ratinggroup.label data-testid="before-label">The host</ratinggroup.label>
			<ratinggroup.error data-testid="before-error">Give the host a rating</ratinggroup.error>
			<BeforeStars />
		</ratinggroup.root>
	</section>
}

function AfterStars() @{
	const rating = ratinggroup.state();

	<div data-testid="after-stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="after-star" />
		}
	</div>
}

function BeforeStars() @{
	const rating = ratinggroup.state();

	<div data-testid="before-stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="before-star" />
		}
	</div>
}
