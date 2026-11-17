import { computed, state } from '@markless/core';
import Form from './form.tsrx';

async function loadItems(): Promise<string[]> {
	await new Promise((done) => setTimeout(done, 10));
	return ['a', 'b'];
}

export default function Page() @{
	const items = computed(async () => loadItems());
	let open = state(false);

	<main>
		<button data-open onClick={() => (open = true)}>Open</button>
		@try {
			<div>
				@if (open) {
					<Form items={items} onSave={() => (open = false)} />
				}
			</div>
		} @pending {
			<div hidden></div>
		}
	</main>
}
