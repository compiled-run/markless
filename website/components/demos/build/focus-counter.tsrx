import { element, state } from '@markless/core';

export default function FocusCounter() @{
	let count = state(0);
	const field = element<HTMLInputElement>();

	<section>
		<label for={field}>Count</label>
		<input el={field} value={count} />
		<button onClick={() => { count++; field?.focus(); }}>Add one and focus</button>
	</section>
}
