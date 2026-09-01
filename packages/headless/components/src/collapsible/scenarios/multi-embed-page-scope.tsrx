import { shared, state } from '@markless/core';
import { collapsible } from '../../index.ts';

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
		<collapsible.root data-testid="page-root">
			<collapsible.trigger data-testid="page-trigger">Where do visitors park?</collapsible.trigger>
			<collapsible.content data-testid="page-content">
				Visitors use the north lot and pay at the kiosk.
			</collapsible.content>
		</collapsible.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
