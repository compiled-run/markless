// Rows of the page, each a component whose @try has a @catch and reads a const, so its settle re-renders the page.
import { computed, state } from '@markless/core';

async function loadItems(filter: string) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	if (filter === 'boom') throw new Error('no items');
	return ['apple', 'banana', 'grape'].filter((name) => name.includes(filter));
}

function List({ initialFilter }: { initialFilter: string }) @{
	const attempts = 0;
	let filter = state(initialFilter);
	const items = computed(async () => loadItems(filter));

	<div class="list">
		<input value={filter} onInput={(event) => (filter = event.target.value)} />
		@try {
			<>
				<ul>
					@for (const item of items; key item) {
						<li>{item}</li>
					}
				</ul>
				<p>Attempt {attempts + 1}</p>
			</>
		} @pending {
			<span>Loading</span>
		} @catch (error, reset) {
			<span data-error>{error.message} <button onClick={reset}>Retry</button></span>
		}
	</div>
}

export default function Page() @{
	let views = state(['', 'an', 'gr']);

	<main>
		@for (const view of views; key view) {
			<List initialFilter={view} />
		}
	</main>
}
