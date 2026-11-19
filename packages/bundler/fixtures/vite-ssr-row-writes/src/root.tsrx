import { state } from '@markless/core';

export function App() @{
	let tasks = state([
		{ slug: 'a', title: 'Alpha', done: false, hits: 0 },
		{ slug: 'b', title: 'Beta', done: false, hits: 0 },
		{ slug: 'c', title: 'Gamma', done: false, hits: 0 },
	]);
	let seats = state([
		{ id: 's1', picked: true },
		{ id: 's2', picked: false },
		{ id: 's3', picked: false },
		{ id: 's4', picked: true },
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
		<ol>
			@for (const seat of seats; index i; key seat.id) {
				<li data-seat={seat.id} data-picked={seat.picked ? 'yes' : 'no'}>
					<button class="pick" onClick={() => (seats[i].picked = !seats[i].picked)}>pick</button>
				</li>
			}
		</ol>
		<button id="seats-reverse" onClick={() => (seats = [...seats].reverse())}>reverse seats</button>
		<button id="seats-unshift" onClick={() => (seats = [{ id: 's0', picked: true }, ...seats])}>add seat</button>
		<button id="seats-drop-first" onClick={() => (seats = seats.slice(1))}>drop first seat</button>
	</main>
}
