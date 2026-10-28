import { computed, state } from '@markless/core';

// A search over an async list: each row is an element with an @if after it, and an @if after the list reads the result.
export default function DirectoryPage() @{
	let query = state('');
	let picked = state('');
	const view = computed(async () => {
		const typed = query;
		await new Promise((resolve) => setTimeout(resolve, 5));
		const names = ['ada', 'bob', 'cyd'].filter((name) => name.includes(typed));
		return { rows: names.map((name, index) => ({ name, last: index === names.length - 1 })), none: names.length === 0 };
	});

	<main>
		<input id="q" onInput={(event) => (query = (event.target as HTMLInputElement).value)} />
		<output id="picked">{picked}</output>
		@try {
			<section>
				<div id="list">
					@for (const row of view.rows; key row.name) {
						<div class="item">
							<button onClick={() => (picked = row.name)}>{row.name}</button>
							@if (!row.last) {
								<hr />
							}
						</div>
					}
				</div>
				@if (view.none) {
					<p id="none">No registries</p>
				} @else {
					<p id="some">Some registries</p>
				}
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
