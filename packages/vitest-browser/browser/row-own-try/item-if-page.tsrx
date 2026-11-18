import { computed, state } from '@markless/core';
import { getStock } from './gate.ts';

export default function ItemIfPage() @{
	let tasks = state([
		{ id: 1, name: 'Pen', done: false },
		{ id: 2, name: 'Ink', done: false },
	]);
	const stock = computed(async () => await getStock(0));

	<section>
		<button data-finish onClick={() => (tasks = tasks.map((task) => (task.id === 2 ? { ...task, done: !task.done } : task)))}>finish</button>
		<ol>
			@for (const task of tasks; key task.id) {
				<li>
					@try {
						<p>
							@if (task.done) {
								<del data-done>{task.name}</del>
							} @else {
								<ins data-todo>{task.name}</ins>
							}
							<b data-count>{task.name}: {stock.find((line) => line.id === task.id)?.count}</b>
						</p>
					} @pending {
						<i data-count-loading>…</i>
					}
				</li>
			}
		</ol>
	</section>
}
