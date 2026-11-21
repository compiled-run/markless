import { state } from '@markless/core';

type Task = { readonly title: string; readonly done: boolean };

export default function App() @{
	let task = state<Task | undefined>(undefined);
	let box = state('untouched');
	<main>
		<h1>Task</h1>
		@if (task) {
			<label>
				<input
					type="checkbox"
					aria-label="Done"
					checked={task.done}
					onChange={(event) => (box = event.currentTarget.checked ? 'ticked' : 'cleared')}
				/>
				{task.title}
			</label>
		} @else {
			<p>No task</p>
		}
		<button onClick={() => (task = { title: 'Water plants', done: true })}>Load done</button>
		<button onClick={() => (task = { title: 'Feed cat', done: false })}>Load open</button>
		<button onClick={() => (task = undefined)}>Clear</button>
		<p>Box: {box}</p>
	</main>
}
