import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Card({ children }: { readonly children?: Children }) @{
	let attempt = state(0);
	const heading = computed(async () => {
		const current = attempt;
		await delay(20);
		if (current === 1) throw new Error('heading failed');
		return `Ledger ${current}`;
	});
	<article data-card>
		<button type="button" data-retry onClick={() => (attempt = attempt + 1)}>Retry</button>
		@try {
			<section>
				<h2 data-heading>{heading}</h2>
				<div data-body>{children}</div>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</article>
}
