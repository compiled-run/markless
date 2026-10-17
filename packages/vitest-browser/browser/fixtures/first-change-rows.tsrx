import { computed, state } from '@markless/core';

const ITEMS = ['foo', 'bar', 'baz'];

export function App() @{
	let search = state('');
	const filtered = computed(() => ITEMS.filter((item) => item.startsWith(search)));

	<div>
		<input data-search placeholder="Search" value={search} onInput={(event) => (search = (event.target as HTMLInputElement).value)} />
		<ul data-results>
			@for (const item of filtered; key item) {
				<li>{item}</li>
			}
		</ul>
	</div>
}
