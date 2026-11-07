import { computed, state } from '@markless/core';
import { waitForTitle } from './gate.ts';

export function Report() @{
	let tally = state(3);
	const title = computed(async () => waitForTitle());
	<main>
		@try {
			<section>
				<h2 data-title>{title}</h2>
				<button type="button" data-tally onClick={() => (tally = tally + 1)}>{tally}</button>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</main>
}
