import { computed, state } from '@markless/core';
import { loadQuote } from './quote-source.ts';

export function Quote() @{
	let id = state(1);
	const quote = computed(async () => await loadQuote(id));

	<main>
		<button type="button" data-next onClick={() => id++}>Next</button>
		<div data-boundary>
			@try {
				<section data-quote>
					<label>
						Note
						<input data-field />
					</label>
					<p data-text>{quote.text}</p>
				</section>
			} @pending {
				<p data-pending>Loading quote</p>
			} @catch (error) {
				<p data-failed>{error.message}</p>
			}
		</div>
	</main>
}
