import { shared, state } from '@markless/core';
import { rating } from '../../index.ts';

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
		<rating.root name="page-stay" count={3} data-testid="page-root">
			<rating.label data-testid="page-label">How was the stay?</rating.label>
			<div data-testid="page-stars">
				<rating.item value={1} data-testid="page-star-1"><span aria-hidden="true">*</span></rating.item>
				<rating.item value={2} data-testid="page-star-2"><span aria-hidden="true">*</span></rating.item>
				<rating.item value={3} data-testid="page-star-3"><span aria-hidden="true">*</span></rating.item>
			</div>
		</rating.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
