import { element, state } from '@markless/core';

// The teaching file: no site classes, because the page prints it and a reader
// pastes it. The framing lives on the wrapper in `focus-field-demo.tsrx`.
export default function FocusField() @{
	let field = element<HTMLInputElement>();
	let status = state('The cursor is somewhere else');

	<section>
		<label>
			Your favourite word
			<input el={field} />
		</label>
		<button
			type="button"
			onClick={() => {
				field?.focus();
				status = 'The cursor is in the field';
			}}
		>
			Put the cursor in the field
		</button>
		<p>{status}</p>
	</section>
}
