// A @try arm of text and an input written straight into a fragment, beside a sibling outside the arm.
import { computed, state } from '@markless/core';

let fetches = 0;
async function loadTodo(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	fetches += 1;
	return { name: `todo-${id}`, fetch: fetches };
}

export default function Page() @{
	let reload = state(0);
	const data = computed(async () => {
		void reload;
		return loadTodo(1);
	});

	<main>
		<button type="button" data-refresh onClick={() => reload++}>Refresh</button>
		<div class="head">
			@try {
				<>Editing "{data.name}" #{data.fetch}<input data-field /></>
			} @pending {}
			<button type="button" data-back>Back</button>
		</div>
	</main>
}
