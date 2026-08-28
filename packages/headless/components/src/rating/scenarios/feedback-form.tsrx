import { state } from '@markless/core';
import { rating } from '../../index.ts';

// The feedback form a checkout has: a real form, a required rating, and an
// output that writes what the browser itself put in the FormData.
export function FeedbackForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<rating.root data-testid="root" name="score" required>
			<rating.label data-testid="label">Overall rating</rating.label>
			<Stars />
			<rating.field data-testid="field" />
		</rating.root>
		<button type="submit" data-testid="submit">Send</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}

function Stars() @{
	const group = rating.state();

	<div data-testid="stars">
		@for (const position of group.positions; key position) {
			<rating.item value={position} data-testid="star" />
		}
	</div>
}
