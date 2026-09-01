import { shared, state } from '@markless/core';
import { buttongroup } from '../../index.ts';

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
		<buttongroup.root value="left" name="page-align" data-testid="page-root">
			<buttongroup.label data-testid="page-label">Text alignment</buttongroup.label>
			<buttongroup.item value="left" data-testid="page-left-item">Left</buttongroup.item>
			<buttongroup.item value="right" data-testid="page-right-item">Right</buttongroup.item>
		</buttongroup.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
