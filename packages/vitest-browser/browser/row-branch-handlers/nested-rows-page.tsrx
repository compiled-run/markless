import { state } from '@markless/core';

type Task = { readonly id: string; readonly done: boolean };
type Group = { readonly id: string; readonly tasks: readonly Task[] };

export default function NestedRowsPage() @{
	let groups = state<readonly Group[]>([
		{ id: 'g1', tasks: [{ id: 't1', done: false }, { id: 't2', done: true }] },
		{ id: 'g2', tasks: [{ id: 't3', done: false }] },
	]);
	let marked = state('');
	<div>
		<output data-marked>{marked}</output>
		@for (const group of groups; key group.id) {
			<section data-group={group.id}>
				<ul>
					@for (const task of group.tasks; key task.id) {
						<li data-task={task.id}>
							@if (task.done) {
								<s data-done={task.id}>{group.id}/{task.id}</s>
							} @else {
								<button
									type="button"
									data-finish={task.id}
									onClick={() => {
										marked = group.id + ':' + task.id;
										groups = groups.map((each) =>
											each.id === group.id
												? { ...each, tasks: each.tasks.map((one) => (one.id === task.id ? { ...one, done: true } : one)) }
												: each,
										);
									}}
								>
									finish
								</button>
							}
						</li>
					}
				</ul>
			</section>
		}
	</div>
}
