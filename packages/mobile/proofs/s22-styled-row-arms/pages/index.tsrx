import { state } from '@markless/core';

type Task = { readonly id: string; readonly name: string; readonly done: boolean };

export default function Tasks() @{
	let tasks = state<ReadonlyArray<Task>>([
		{ id: 'a', name: 'Apples', done: false },
		{ id: 'b', name: 'Bread', done: true },
	]);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.tasks {
				margin: 16px 0 0;
				padding: 0;
				list-style: none;
			}
			.task {
				display: flex;
				flex-direction: column;
				gap: 8px;
				margin-top: 8px;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
			}
			.name {
				font-size: 17px;
				color: #212529;
			}
			.done {
				align-self: flex-start;
				padding: 2px 10px;
				border-radius: 999px;
				background: #d8f3dc;
				color: #1b4332;
				font-size: 13px;
			}
			.finish {
				display: block;
				width: 100%;
				padding: 14px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #e9f5f9;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.action {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.footer {
				margin-top: 24px;
				padding-top: 12px;
				border-top: 1px solid #adb5bd;
				color: #495057;
				font-size: 15px;
			}
		</style>
		<title>Tasks</title>
		<h1 class="heading">Tasks</h1>
		<ul class="tasks">
			@for (const task of tasks; key task.id) {
				<li class="task">
					<span class="name">{task.name}</span>
					@if (task.done) {
						<span class="done">Done</span>
					} @else {
						<button
							class="finish"
							onClick={() => (tasks = tasks.map((one) => (one.id === task.id ? { ...one, done: true } : one)))}
						>
							Finish {task.name}
						</button>
					}
				</li>
			}
		</ul>
		<button class="action" onClick={() => (tasks = [...tasks, { id: 'c', name: 'Cheese', done: false }])}>
			Add cheese
		</button>
		<button class="action" onClick={() => (tasks = tasks.map((one) => ({ ...one, done: false })))}>
			Undo all
		</button>
		<footer class="footer">End of list</footer>
	</main>
}
