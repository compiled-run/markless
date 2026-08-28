// Registration is a follow-up unit, so the family is imported from its own
// barrel rather than the package's. The call sites are the ones a consumer will
// write: `import { ratinggroup } from '@markless/ui'`.
import * as ratinggroup from '../index.ts';

// The starter a consumer copies: five marks, nothing rated yet.
export function Basic() @{
	<ratinggroup.root data-testid="root">
		<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
		<Stars />
		<ratinggroup.valuelabel data-testid="valuelabel" />
	</ratinggroup.root>
}

// The marks are the consumer's own markup, and they sit INSIDE the root: a
// component that reads the group's state is a part of that group's widget, and
// one placed outside would start a second group of its own. A construct may not
// be the direct child of a component tag either, so the repeat opens in a plain
// element.
function Stars() @{
	const rating = ratinggroup.state();

	<div data-testid="stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="star">
				<span data-testid="glyph" aria-hidden="true">*</span>
			</ratinggroup.item>
		}
	</div>
}
