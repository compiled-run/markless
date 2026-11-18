import { computed, state } from '@markless/core';

// Module-scope arrow consts written without semicolons, called from an async recipe and a handler.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const lookup = async (id) => {
	await wait(5)
	return { title: `item-${id}` }
}
const advance = (value) => value + 1

export function App() @{
	let id = state(1);
	const item = computed(async () => lookup(id));

	<section>
		<button type="button" data-next onClick={() => (id = advance(id))}>Next</button>
		@try {
			<h2 data-title>{item.title}</h2>
		} @pending {
			<p data-wait>Loading</p>
		}
	</section>
}
