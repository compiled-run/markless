import { rating } from '../../index.ts';

// The starter a consumer copies: five marks, nothing rated yet.
export function Basic() @{
	<rating.root data-testid="root">
		<rating.label data-testid="label">Overall rating</rating.label>
		<Stars />
		<rating.valuelabel data-testid="valuelabel" />
	</rating.root>
}

// The marks are the consumer's own markup, and they sit INSIDE the root: a
// component that reads the group's state is a part of that group's widget, and
// one placed outside would start a second group of its own. A construct may not
// be the direct child of a component tag either, so the repeat opens in a plain
// element.
function Stars() @{
	const group = rating.state();

	<div data-testid="stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="star">
				<span data-testid="glyph" aria-hidden="true">*</span>
			</rating.item>
		}
	</div>
}
