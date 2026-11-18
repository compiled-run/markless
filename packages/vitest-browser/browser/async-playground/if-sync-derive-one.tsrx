// A page @if whose arm holds a component with a sync computed over its own state.
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

export default function Page() @{
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
