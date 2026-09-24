import { state } from '@markless/core';

export function App() @{
	let tasks = state([
		{ slug: 'a', title: 'Alpha', done: false, hits: 0 },
		{ slug: 'b', title: 'Beta', done: false, hits: 0 },
		{ slug: 'c', title: 'Gamma', done: false, hits: 0 },
	]);

	<main>
		<ul>
			@for (const task of tasks; key task.slug) {
				<li data-slug={task.slug} data-done={task.done ? 'yes' : 'no'}>
					<span class="title">{task.title}</span>
					<span class="hits">{task.hits}</span>
					<button class="toggle" onClick={() => (task.done = !task.done)}>toggle</button>
					<button class="hit" onClick={() => task.hits++}>hit</button>
				</li>
			}
		</ul>
		<button id="reverse" onClick={() => (tasks = [...tasks].reverse())}>reverse</button>
	</main>
}
