import { shared, state } from '@markless/core';
import { checkbox } from '../../index.ts';

// Page scope is one cell for the whole page, so the island discriminator that
// keeps each embed's widget cells apart must not reach it: both embeds read this
// counter and both see the other's write.
const pageReads = shared(
	() => {
		const reads = state({ count: 0 });

		return {
			...reads,
			bump() {
				reads.count = reads.count + 1;
			},
		};
	},
	{ scope: 'page' },
);

export default function MultiEmbedPageScope() @{
	const shelf = pageReads();

	<section data-testid="page-frame">
		<checkbox.root name="page-terms" data-testid="page-root">
			<checkbox.trigger data-testid="page-trigger">
				<checkbox.indicator data-testid="page-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="page-label">I accept the terms of service</checkbox.label>
		</checkbox.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
