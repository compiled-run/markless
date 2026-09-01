import { shared, state } from '@markless/core';
import { radiogroup } from '../../index.ts';

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
		<radiogroup.root name="page-shipping" data-testid="page-root">
			<radiogroup.label data-testid="page-label">Shipping speed</radiogroup.label>
			<radiogroup.item value="standard" data-testid="page-standard-item">
				<radiogroup.itemfield data-testid="page-standard-field" />
				<radiogroup.itemtrigger data-testid="page-standard-trigger">
					<span data-testid="page-standard-dot" aria-hidden="true">o</span>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="page-standard-label">Standard, 5 days</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="overnight" data-testid="page-overnight-item">
				<radiogroup.itemfield data-testid="page-overnight-field" />
				<radiogroup.itemtrigger data-testid="page-overnight-trigger">
					<span data-testid="page-overnight-dot" aria-hidden="true">o</span>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="page-overnight-label">Overnight</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
