import { rating } from '../../index.ts';

// Help text and a validation message. The second group writes its error BEFORE
// the marks, because document order must not decide what the group describes
// itself with.
export function WithHelp() @{
	<section>
		<rating.root data-testid="after-root">
			<rating.label data-testid="after-label">Overall rating</rating.label>
			<rating.description data-testid="after-description">Rate the stay from one to five.</rating.description>
			<AfterStars />
			<rating.error data-testid="after-error">Give the stay a rating</rating.error>
		</rating.root>
		<rating.root data-testid="before-root">
			<rating.label data-testid="before-label">The host</rating.label>
			<rating.error data-testid="before-error">Give the host a rating</rating.error>
			<BeforeStars />
		</rating.root>
	</section>
}

function AfterStars() @{
	const group = rating.state();

	<div data-testid="after-stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="after-star" />
		}
	</div>
}

function BeforeStars() @{
	const group = rating.state();

	<div data-testid="before-stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="before-star" />
		}
	</div>
}
