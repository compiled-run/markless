// The @if sits two components below the page, after a sibling component with state of its own.
import { computed, state } from '@markless/core';

async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { name: `todo-${id}` };
}

function EditTodo({ editingId, close }: { editingId: number; close: () => void }) @{
	const todo = computed(async () => loadTodo(editingId));
	let saving = state(false);
	const locked = computed(() => false || saving);

	<div class="edit">
		@try {
			<>
				<span data-edit-name>{todo.name}</span>
				<button type="button" data-save disabled={locked} onClick={() => (saving = !saving)}>Save</button>
				<button type="button" data-unlock onClick={() => (saving = false)}>Unlock</button>
			</>
		} @pending {
			<span data-edit-pending>Loading</span>
		}
		<button type="button" data-close onClick={() => close()}>Back</button>
	</div>
}

function Banner() @{
	let count = state(0);
	<p class="banner" onClick={() => count++}>Banner {count}</p>
}

function Editor() @{
	let editingId = state<number | null>(null);

	<section>
		<button type="button" data-open-one onClick={() => (editingId = 1)}>One</button>
		<button type="button" data-open-two onClick={() => (editingId = 2)}>Two</button>
		@if (editingId !== null) {
			<>
				<EditTodo editingId={editingId} close={() => (editingId = null)} />
				<hr />
			</>
		}
	</section>
}

function Panel() @{
	<main>
		<Banner />
		<Editor />
	</main>
}

export default function Page() @{
	<div class="page">
		<h1>Todos</h1>
		<Panel />
	</div>
}
