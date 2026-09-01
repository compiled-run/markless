import { shared, state } from '@markless/core';
import { checklist } from '../../index.ts';

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
		<checklist.root values={['lettuce', 'tomato']} data-testid="page-root">
			<checklist.label data-testid="page-label">Sandwich condiments</checklist.label>
			<checklist.item value="lettuce" data-testid="page-lettuce-item">
				<checklist.itemtrigger data-testid="page-lettuce-trigger">
					<checklist.itemindicator data-testid="page-lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="page-lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="tomato" data-testid="page-tomato-item">
				<checklist.itemtrigger data-testid="page-tomato-trigger">
					<checklist.itemindicator data-testid="page-tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="page-tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
