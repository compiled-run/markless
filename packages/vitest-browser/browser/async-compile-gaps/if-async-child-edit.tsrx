import { computed, state } from '@markless/core';

// A page @if whose arm holds a same-file component with an async value of its own,
// wrapped in a fragment with a sibling and handed a callback, like a converted edit form;
// the @if sits in a child of the page, so the arm's instance ids carry that child's prefix.
async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { name: `todo-${id}` };
}

function EditTodo({ editingId, close }: { editingId: number; close: () => void }) @{
	const todo = computed(async () => loadTodo(editingId));

	<div class="edit">
		@try {
			<span data-edit-name>{todo.name}</span>
		} @pending {
			<span data-edit-pending>Loading</span>
		}
		<button type="button" data-close onClick={() => close()}>Back</button>
	</div>
}

function Editor() @{
	let editingId = state<number | null>(null);

	<main>
		<button type="button" data-open-one onClick={() => (editingId = 1)}>One</button>
		<button type="button" data-open-two onClick={() => (editingId = 2)}>Two</button>
		@if (editingId !== null) {
			<>
				<EditTodo editingId={editingId} close={() => (editingId = null)} />
				<hr />
			</>
		}
	</main>
}

export function App() @{
	<div class="page">
		<h1>Todos</h1>
		<Editor />
	</div>
}
