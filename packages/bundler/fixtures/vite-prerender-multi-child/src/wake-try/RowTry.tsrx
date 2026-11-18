import { computed, state } from '@markless/core';
import { loadStock } from './stock';

export function App() @{
	let round = state(0);
	let tools = state([
		{ id: 1, name: 'Pen' },
		{ id: 2, name: 'Ink' },
	]);
	const stock = computed(async () => loadStock(round));

	<main data-multi-child>
		<button type="button" data-again onClick={() => round = round + 1}>Again</button>
		<button type="button" data-rename onClick={() => tools = tools.map((tool) => (tool.id === 2 ? { ...tool, name: 'Nib' } : tool))}>Rename</button>
		<ol>
			@for (const tool of tools; key tool.id) {
				<li>
					@try {
						<b data-count>{tool.name}: {stock.find((line) => line.id === tool.id)?.count}</b>
					} @pending {
						<i data-count-wait>…</i>
					}
				</li>
			}
		</ol>
	</main>
}
