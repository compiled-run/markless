import { state } from '@markless/core';
import { base } from '@markless/ui';

export default function App() @{
	let tasks = state([
		{ id: 'milk', title: 'Milk' },
		{ id: 'bread', title: 'Bread' },
	]);
	let done = state(0);
	<main>
		<h1>Tasks</h1>
		<button onClick={() => (tasks = [...tasks, { id: 'eggs', title: 'Eggs' }])}>Add eggs</button>
		<ul>
			@for (const task of tasks; key task.id) {
				<li>
					<base.button pressed={false} onChange={(next) => (done = next ? done + 1 : done - 1)}>{task.title}</base.button>
					<button onClick={() => (tasks = tasks.filter((other) => other.id !== task.id))}>Remove {task.title}</button>
				</li>
			} @empty {
				<li>No tasks</li>
			}
		</ul>
		<p>Done {done}</p>
	</main>
}
