import { computed, state } from '@markless/core';

// An async value in a component two levels under the page, re-run by a prop its parent bumps.
let fetches = 0;
async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	fetches += 1;
	return { name: `todo-${id}`, fetch: fetches };
}

function Detail({ editingId, reload }: { editingId: number; reload: number }) @{
	const todo = computed(async () => {
		void reload;
		return loadTodo(editingId);
	});

	<div class="detail">
		@try {
			<p><span data-name>{todo.name}</span> <span data-fetch>{todo.fetch}</span></p>
		} @pending {
			<span data-pending>Loading</span>
		}
	</div>
}

function Board() @{
	let reload = state(0);
	let editingId = state(1);

	<section>
		<button type="button" data-refresh onClick={() => reload++}>Refresh</button>
		<button type="button" data-pick onClick={() => (editingId = 2)}>Two</button>
		<Detail editingId={editingId} reload={reload} />
	</section>
}

export default function Page() @{
	<div class="page">
		<h1>Todos</h1>
		<Board />
	</div>
}
