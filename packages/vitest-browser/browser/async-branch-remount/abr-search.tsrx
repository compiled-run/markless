import { computed, state } from '@markless/core';

const COMMANDS = ['Accordion', 'Alert', 'Badge', 'Button', 'Calendar', 'Card', 'Dialog', 'Drawer'];

async function search(query: string) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return COMMANDS.filter((name) => name.toLowerCase().includes(query.toLowerCase())).map((name) => ({ id: name.toLowerCase(), name }));
}

export default function SearchDialog() @{
	let open = state(false);
	let query = state('');
	const results = computed(async () => await search(query));
	<div>
		<button type="button" data-open onClick={() => open = !open}>Search</button>
		<input data-query value={query} onInput={(event) => query = event.currentTarget.value} />
		@if (open) {
			<div data-list style="height: 40px; overflow: auto">
				@try {
					@for (const result of results; key result.id) {
						<div data-result style="height: 20px">{result.name}</div>
					}
				} @pending {
					<p data-loading>Loading</p>
				} @catch {
					<p data-failed>Failed</p>
				}
			</div>
		}
	</div>
}
