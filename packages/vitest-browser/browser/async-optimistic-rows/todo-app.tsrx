import { computed, state } from '@markless/core';
import { listTodos, saveTodo, toggleTodo, type Draft, type Todo } from './save-api.ts';

// Each submission is its own row: @pending shows the draft, the @try arm the confirmed result, @catch the failure with retry.
function SavingTodo({ draft }: { draft: Draft }) @{
	const saved = computed(async () => await saveTodo(draft));

	<li data-row data-saving-row data-id={draft.id}>
		@try {
			<span data-confirmed>{saved.title}</span>
		} @pending {
			<span data-optimistic class="optimistic">{draft.title}</span>
		} @catch (error, reset) {
			<span data-failed>
				{draft.title}: couldn't save <button type="button" data-retry onClick={reset}>Retry</button>
			</span>
		}
	</li>
}

// While no edit is pending the recipe returns the confirmed row unchanged, so an untouched row never saves.
function EditingTodo({ todo }: { todo: Todo }) @{
	let pendingDone = state<boolean | undefined>(undefined);
	const saved = computed(async () => {
		if (pendingDone === undefined) return todo;
		return await toggleTodo(todo.id, pendingDone);
	});

	<li data-row data-editing-row data-id={todo.id}>
		@try {
			<span data-confirmed>
				{saved.title} · {saved.done ? 'done' : 'open'}
				<button type="button" data-toggle onClick={() => (pendingDone = !saved.done)}>Toggle</button>
			</span>
		} @pending {
			<span data-optimistic class="optimistic">
				{todo.title} · {pendingDone ? 'done' : 'open'} (saving)
			</span>
		} @catch (error, reset) {
			<span data-failed>
				{todo.title}: couldn't save <button type="button" data-retry onClick={reset}>Retry</button>
			</span>
		}
	</li>
}

export default function TodoApp() @{
	let title = state('');
	let drafts = state<Draft[]>([]);
	let reload = state(0);
	const todos = computed(async () => {
		const r = reload;
		return listTodos();
	});

	<main>
		<form
			data-form
			onSubmit={(event) => {
				event.preventDefault();
				const value = title.trim();
				if (!value) return;
				drafts = [...drafts, { id: crypto.randomUUID(), title: value }];
				title = '';
			}}
		>
			<input data-title value={title} onInput={(event) => (title = (event.target as HTMLInputElement).value)} />
			<button type="submit" data-add>Add</button>
		</form>
		<button type="button" data-reload onClick={() => (reload = reload + 1)}>Reload</button>
		@try {
			<ul data-list>
				@for (const todo of todos.filter((row) => !drafts.some((draft) => draft.id === row.id)); key todo.id) {
					<EditingTodo todo={todo} />
				}
				@for (const draft of drafts; key draft.id) {
					<SavingTodo draft={draft} />
				}
			</ul>
		} @pending {
			<p data-list-loading>Loading</p>
		}
	</main>
}
