import { element, state } from '@markless/core';

export function NameTag() @{
	const field = element<HTMLInputElement>();
	let name = state('');

	<div>
		<label for={field}>Name</label>
		<input data-testid="name-field" el={field} onInput={(event) => (name = event.currentTarget.value)} />
		<button
			data-testid="name-focus"
			onClick={() => {
				field?.focus();
				field?.select();
			}}
		>Edit</button>
		<output data-testid="name">{name}</output>
	</div>
}
