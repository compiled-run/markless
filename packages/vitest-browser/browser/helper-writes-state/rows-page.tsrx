import { state } from '@markless/core';
import { markDone, retitle, titleOf } from './mutators.ts';

export default function RowsPage() @{
	let board = state({ meta: { title: 'week' }, tasks: [{ id: 't1', title: 'mail', done: false }, { id: 't2', title: 'shop', done: false }] });
	let shown = state('');
	<section>
		<h2 data-title>{board.meta.title}</h2>
		<output data-shown>{shown}</output>
		<button data-retitle onClick={() => retitle(board, 'month')}>retitle</button>
		<button data-show onClick={() => { shown = titleOf(board); }}>show</button>
		<ul>
			@for (const task of board.tasks; key task.id) {
				<li data-task={task.id}>
					<span>{task.done ? 'done' : 'open'}</span>
					<button onClick={() => markDone(task)}>toggle</button>
				</li>
			}
		</ul>
	</section>
}
