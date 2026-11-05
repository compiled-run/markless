import { element } from '@markless/core';

export function SearchBox() @{
	const field = element<HTMLInputElement>();

	<div>
		<label for={field}>Search</label>
		<input data-testid="search-field" el={field} />
		<button data-testid="search-focus" onClick={() => field?.focus()}>Search</button>
	</div>
}
