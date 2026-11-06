import { computed, state } from '@markless/core';
import Button from './button.tsrx';
import { listTodos, saveTodo, type Draft, type Todo } from './api.ts';

function ConfirmedTodo({ todo }: { todo: Todo }) @{
	<li data-confirmed-row>{todo.title}</li>
}

function SavingTodo({ draft }: { draft: Draft }) @{
	const saved = computed(async () => await saveTodo(draft));
	const label = computed(() => draft.title.toUpperCase());

	<li data-saving-row data-id={draft.id}>
		<b data-label>{label}</b>
		@try {
			<span data-confirmed>{saved.title}</span>
		} @pending {
			<span data-optimistic>{draft.title}</span>
		} @catch (error, reset) {
			<span data-failed>
				{draft.title}: couldn't save <button type="button" data-retry onClick={reset}>Retry</button>
			</span>
		}
	</li>
}

export default function SiteTodos({ reload }: { reload: number }) @{
	let text = state('');
	let drafts = state<Draft[]>([]);
	const todos = computed(async () => await listTodos(reload));

	<div data-todos>
		<input data-title value={text} onInput={(event) => (text = (event.target as HTMLInputElement).value)} />
		<Button
			onClick={() => {
				const value = text.trim();
				if (!value) return;
				drafts = [...drafts, { id: crypto.randomUUID(), title: value }];
				text = '';
			}}
		>
			Add
		</Button>
		@try {
			<ul>
				@for (const todo of todos.filter((row) => !drafts.some((pending) => pending.id === row.id)); key todo.id) {
					<ConfirmedTodo todo={todo} />
				}
				@for (const draft of drafts; key draft.id) {
					<SavingTodo draft={draft} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch {
			<p data-list-failed>Couldn't load tasks.</p>
		}
	</div>
}
