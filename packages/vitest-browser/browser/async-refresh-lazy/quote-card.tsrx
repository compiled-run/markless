import { computed, state } from '@markless/core';

async function loadQuote(id: number) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return { text: `quote ${id}` };
}

export default function QuoteCard() @{
	let id = state(1);
	let likes = state(0);
	const quote = computed(async () => await loadQuote(id));
	<main>
		<button type="button" data-like onClick={() => likes++}>Like</button>
		<output data-likes>{likes}</output>
		<button type="button" data-next onClick={() => id++}>Next</button>
		@try {
			<p data-quote>{quote.text}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
