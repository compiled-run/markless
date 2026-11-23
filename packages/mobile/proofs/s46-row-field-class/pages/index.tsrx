import { computed, state } from '@markless/core';
import { loadTasks } from '../lib/tasks.ts';

export default function Tasks() @{
	let done = state(1);
	const tasks = computed(async () => loadTasks(done));
	<main class="page">
		<title>Tasks</title>
		<h1 class="heading">Tasks</h1>
		<p class="note">{done} finished</p>
		@try {
			@if (tasks.rows.length === 0) {
				<p class="note">No tasks</p>
			} @else {
				<ul class="tasks">
					@for (const row of tasks.rows; key row.id) {
						<li class={row.tone}>
							<span class="title">{row.title}</span>
						</li>
					}
				</ul>
			}
		} @pending {
			<p class="note">Loading tasks</p>
		}
		<button class="action" onClick={() => done++}>
			Finish one
		</button>
		<footer class="footer">End of tasks</footer>
	</main>
}
