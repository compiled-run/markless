// The same edit header under an @if in the page's child.
import { computed, state } from '@markless/core';

let fetches = 0;
async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	fetches += 1;
	return { name: `todo-${id}`, fetch: fetches };
}

function EditTodo({ editingId, reload }: { editingId: number; reload: number }) @{
	const data = computed(async () => {
		void reload;
		return loadTodo(editingId);
	});

	<div class="edit">
		<div class="head">
			@try {
				<>Editing "{data.name}" #{data.fetch}</>
			} @pending {}
			<button type="button" data-back>Back</button>
		</div>
		@try {
			<span data-edit-name>{data.name}</span>
		} @pending {
			<span>Loading</span>
		}
	</div>
}

function Editor() @{
	let reload = state(0);
	let editingId = state<number | null>(null);

	<main>
		<button type="button" data-refresh onClick={() => reload++}>Refresh</button>
		<button type="button" data-open onClick={() => (editingId = 1)}>Open</button>
		@if (editingId !== null) {
			<>
				<EditTodo editingId={editingId} reload={reload} />
				<hr />
			</>
		}
	</main>
}

export default function Page() @{
	<div class="page">
		<Editor />
	</div>
}
