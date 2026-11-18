import { element } from '@markless/core';
import { SearchBox } from './search-box.tsrx';

export default function RootFieldPage() @{
	const field = element<HTMLInputElement>();

	<main>
		<input data-testid="root-field" el={field} />
		<button data-testid="root-focus" onClick={() => field?.focus()}>Root</button>
		<SearchBox />
	</main>
}
