import { state } from '@markless/core';

export default function SearchNavPage() @{
	let query = state('');
	let left = state(0);
	<main>
		<input
			data-search
			value={query}
			onInput={(event) => (query = (event.target as HTMLInputElement).value)}
			onFocusout={() => left++}
		/>
		<output data-left>{left}</output>
		@if (query) {
			<ul data-results>
				<li><a data-to-target href="/hash-target">{query}</a></li>
			</ul>
		}
	</main>;
}
