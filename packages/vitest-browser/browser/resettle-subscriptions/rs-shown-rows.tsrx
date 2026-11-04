import { computed, state } from '@markless/core';

const TOOLS = ['Awl', 'Axe', 'Chisel', 'Clamp', 'Drill', 'File'];

async function search(query: string) {
	await new Promise((resolve) => setTimeout(resolve, 2));
	if (query === 'x') throw new Error('No match');
	return TOOLS.filter((name) => name.toLowerCase().includes(query.toLowerCase())).map((name) => ({ id: name, name }));
}

export default function Toolbox() @{
	let open = state(false);
	let query = state('');
	let picked = state('none');
	const tools = computed(async () => await search(query));
	<section>
		<button type="button" data-open onClick={() => open = !open}>Tools</button>
		<input data-query value={query} onInput={(event) => query = event.currentTarget.value} />
		<output data-picked>{picked}</output>
		@if (open) {
			<div data-list>
				@try {
					@for (const tool of tools; key tool.id) {
						<p data-result onClick={() => picked = tool.name}>{tool.name}</p>
					}
				} @pending {
					<p data-loading>Loading</p>
				} @catch {
					<p data-failed>Failed</p>
				}
			</div>
		}
	</section>
}
