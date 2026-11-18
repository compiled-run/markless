import { state } from '@markless/core';

type Task = { readonly code: number; readonly title: string; readonly done: boolean };

function openTasks(list: readonly Task[], limit: number) {
	return list.filter((task) => !task.done).slice(0, limit);
}

export function OpenTasks() @{
	let tasks = state<Task[]>([
		{ code: 7, title: 'write', done: false },
		{ code: 3, title: 'ship', done: true },
		{ code: 9, title: 'review', done: false },
	]);
	let limit = state(5);

	<article>
		<button data-add onClick={() => (tasks = [...tasks, { code: tasks.length + 10, title: `task ${tasks.length}`, done: false }])}>add</button>
		<button data-finish onClick={() => (tasks = tasks.map((task) => ({ ...task, done: true })))}>finish</button>
		<button data-fewer onClick={() => limit--}>fewer</button>
		<ol>
			@for (const task of openTasks(tasks, limit); key task.code) {
				<li data-task>{task.title}</li>
			} @empty {
				<li data-none>nothing open</li>
			}
		</ol>
	</article>
}
