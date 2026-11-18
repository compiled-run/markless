import { computed, state } from '@markless/core';

// The value under an @if two components below the page, like the converted edit form.
let fetches = 0;
async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	fetches += 1;
	return { name: `todo-${id}`, fetch: fetches };
}

function EditTodo({ editingId, reload }: { editingId: number; reload: number }) @{
	const todo = computed(async () => {
		void reload;
		return loadTodo(editingId);
	});

	<div class="edit">
		@try {
			<p><span data-name>{todo.name}</span> <span data-fetch>{todo.fetch}</span></p>
		} @pending {
			<span data-pending>Loading</span>
		}
	</div>
}

function Editor() @{
	let reload = state(0);
	let editingId = state<number | null>(null);

	<main>
		<button type="button" data-refresh onClick={() => reload++}>Refresh</button>
		<button type="button" data-open onClick={() => (editingId = 1)}>One</button>
		<button type="button" data-pick onClick={() => (editingId = 2)}>Two</button>
		@if (editingId !== null) {
			<>
				<EditTodo editingId={editingId} reload={reload} />
				<hr />
			</>
		}
	</main>
}

function Shell() @{
	<div class="shell">
		<Editor />
	</div>
}

export default function Page() @{
	<div class="page">
		<h1>Todos</h1>
		<Shell />
	</div>
}
