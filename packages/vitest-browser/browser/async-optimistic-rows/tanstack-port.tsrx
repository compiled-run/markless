import { computed, state } from '@markless/core';
import { listTodos, saveTodo, type Draft } from './save-api.ts';

// Port of TanStack Query's "Optimistic Updates" guide, "Via the UI" variant
// (docs/framework/react/guides/optimistic-updates.md, ExampleUI1-3; the
// dedicated examples/react/optimistic-updates-ui example folder no longer
// exists in the TanStack/query repo — this ports the guide's own code, which
// is the same shape). There: addTodoMutation.isPending shows the submitted
// variables dimmed; isError keeps showing them in red with a retry button
// that re-calls mutate(variables); onSettled invalidates the list query.
// Here: each draft IS its own async value, so there is no separate dimmed
// "variables" render and no cache to invalidate — the row's own arm is the
// pending/error state.
function AddedTodo({ draft }: { draft: Draft }) @{
	const saved = computed(async () => await saveTodo(draft));

	<li data-row data-id={draft.id}>
		@try {
			<span data-confirmed>{saved.title}</span>
		} @pending {
			<span data-optimistic style="opacity: 0.5">{draft.title}</span>
		} @catch (error, reset) {
			<span data-failed style="color: red">
				{draft.title} <button type="button" data-retry onClick={reset}>Retry</button>
			</span>
		}
	</li>
}

export default function TanstackOptimisticUpdatesPort() @{
	let text = state('');
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
				const value = text.trim();
				if (!value) return;
				drafts = [...drafts, { id: crypto.randomUUID(), title: value }];
				text = '';
			}}
		>
			<input data-text value={text} onInput={(event) => (text = (event.target as HTMLInputElement).value)} />
			<button type="submit" data-add>Add</button>
		</form>
		@try {
			<ul data-list>
				@for (const todo of todos.filter((row) => !drafts.some((draft) => draft.id === row.id)); key todo.id) {
					<li data-row data-confirmed>{todo.title}</li>
				}
				@for (const draft of drafts; key draft.id) {
					<AddedTodo draft={draft} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
