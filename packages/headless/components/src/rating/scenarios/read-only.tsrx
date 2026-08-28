import { rating } from '../../index.ts';

// The display-only aggregate most rendered ratings are: still a rating a reader
// can read, and nothing a person does changes it.
export function ReadOnly() @{
	<rating.root data-testid="root" readonly half value={4.5}>
		<rating.label data-testid="label">Average guest rating</rating.label>
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
