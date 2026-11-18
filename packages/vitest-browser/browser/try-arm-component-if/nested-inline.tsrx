import { computed, state } from '@markless/core';

async function loadItems(): Promise<string[]> {
	await new Promise((done) => setTimeout(done, 10));
	return ['a', 'b'];
}

export default function NestedInline() @{
	const items = computed(async () => loadItems());
	let open = state(false);
	let touched = state(false);

	<main>
		<button data-open onClick={() => (open = true)}>Open</button>
		@try {
			<div>
				@if (open) {
					<form>
						<span>{items.length}</span>
						<button type="button" data-touch onClick={() => (touched = true)}>Touch</button>
						@if (touched) {
							<span data-required>Required</span>
						}
					</form>
				}
			</div>
		} @pending {
			<div hidden></div>
		}
	</main>
}
