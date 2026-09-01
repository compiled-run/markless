import { shared, state } from '@markless/core';
import { tabs } from '../../index.ts';

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
		<tabs.root value="overview" data-testid="page-root">
			<tabs.list data-testid="page-list">
				<tabs.trigger value="overview" data-testid="page-overview-trigger">Overview</tabs.trigger>
				<tabs.trigger value="usage" data-testid="page-usage-trigger">Usage</tabs.trigger>
			</tabs.list>
			<tabs.content value="overview" data-testid="page-overview-content">
				Everything that happened this month.
			</tabs.content>
			<tabs.content value="usage" data-testid="page-usage-content">
				How much of the plan you have used.
			</tabs.content>
		</tabs.root>
		<button type="button" data-testid="page-bump" onClick={() => shelf.bump()}>
			This helped me
		</button>
		<span data-testid="page-value">{shelf.count}</span>
	</section>
}
