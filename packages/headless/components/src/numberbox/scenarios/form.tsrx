import { state } from '@markless/core';
import { numberbox } from '../../index.ts';

// An order form with a number in it. On submit it renders the FormData the
// browser actually built, so a test can read a submission rather than an
// attribute - and the point of the family is that the two differ: the input shows
// a grouped number and the form carries a plain one.
export default function Form() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(
				Object.fromEntries(new FormData(event.target as HTMLFormElement)),
			);
		}}
	>
		<numberbox.root value={1234.5} required name="quantity" data-testid="root">
			<numberbox.label data-testid="label">Quantity</numberbox.label>
			<numberbox.input data-testid="input" />
			<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
			<numberbox.field data-testid="field" />
		</numberbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
