import { state } from '@markless/core';

// A handler plus a @for over the async value this component got as a prop.
export default function FormList({ items }: { items: Array<string> }) @{
	let handled = state(0);

	<form
		onSubmit={(event) => {
			event.preventDefault();
			handled++;
		}}
	>
		<ul>
			@for (const item of items; key item) {
				<li>{item}</li>
			}
		</ul>
		<span data-handled>{handled}</span>
		<button data-submit type="submit">Add</button>
	</form>
}
