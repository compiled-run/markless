import { computed, state } from '@markless/core';
import { fetchTasks } from './fetch-rows.ts';

export default function TaskBoard() @{
	let last = state('-');
	const tasks = computed(async () => await fetchTasks());

	<article>
		<span data-last>{last}</span>
		@try {
			<table>
				<tbody>
					@for (const task of tasks; key task.slug) {
						<tr>
							@if (task.done) {
								<td><button data-undo onClick={() => (last = `undo:${task.slug}`)}>undo</button></td>
							} @else {
								<td><a href="#" data-finish onClick={(event) => { event.preventDefault(); last = `finish:${task.slug}`; }}>finish</a></td>
							}
							<td>
								@for (const step of task.steps; key step) {
									<i data-step onClick={() => (last = `step:${task.slug}:${step}`)}>{step}</i>
								}
							</td>
						</tr>
					}
				</tbody>
			</table>
		} @pending {
			<b>loading</b>
		}
	</article>
}
