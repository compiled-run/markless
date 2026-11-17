import { computed, state } from '@markless/core';
import { getRestock } from './gate.ts';

export default function AddRowPage() @{
	let round = state(0);
	let tools = state([{ id: 1, name: 'Pen' }]);
	const stock = computed(async () => await getRestock(round));

	<main>
		<button data-add onClick={() => (tools = [...tools, { id: 2, name: 'Ink' }])}>add</button>
		<button data-rename onClick={() => (tools = tools.map((tool) => (tool.id === 2 ? { ...tool, name: 'Nib' } : tool)))}>rename</button>
		<button data-again onClick={() => round++}>again</button>
		<button data-drop onClick={() => (tools = tools.filter((tool) => tool.id !== 2))}>drop</button>
		<ol>
			@for (const tool of tools; key tool.id) {
				<li>
					@try {
						<b data-count>{tool.name}: {stock.find((line) => line.id === tool.id)?.count}</b>
					} @pending {
						<i data-count-loading>…</i>
					}
				</li>
			}
		</ol>
	</main>
}
