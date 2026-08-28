import { state } from '@markless/core';
import { ratinggroup } from '../../index.ts';

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
		<ratinggroup.root data-testid="root" name="score" required>
			<ratinggroup.label data-testid="label">Overall rating</ratinggroup.label>
			<Stars />
			<ratinggroup.field data-testid="field" />
		</ratinggroup.root>
		<button type="submit" data-testid="submit">Send</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}

function Stars() @{
	const rating = ratinggroup.state();

	<div data-testid="stars">
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} data-testid="star" />
		}
	</div>
}
