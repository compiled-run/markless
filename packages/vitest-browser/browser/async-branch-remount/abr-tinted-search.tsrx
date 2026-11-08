import { computed, state } from '@markless/core';

const WORDS = ['Apple', 'Apricot', 'Banana', 'Cherry'];

async function match(prefix: string) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return WORDS.filter((word) => word.toLowerCase().startsWith(prefix.toLowerCase())).map((word) => ({ id: word, word }));
}

export default function TintedSearch({ tint }: { readonly tint: string }) @{
	let open = state(false);
	let prefix = state('');
	const found = computed(async () => await match(prefix));
	<div>
		<button type="button" data-open onClick={() => open = !open}>Search</button>
		<input data-query value={prefix} onInput={(event) => prefix = event.currentTarget.value} />
		@if (open) {
			<ul data-list data-tint={tint} style="height: 40px; overflow: auto">
				@try {
					@for (const hit of found; key hit.id) {
						<li data-result style="height: 20px">{hit.word}</li>
					}
				} @pending {
					<li data-loading>Loading</li>
				}
			</ul>
		}
	</div>
}
