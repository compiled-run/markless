import { computed } from '@markless/core';
import { tabs } from '../../index.ts';

// Tabs authored over a list rather than written out one by one.
//
// The data lives inside the `computed()` because a module-level const read from
// one is not carried into the lowered symbol. Each loop needs an intrinsic
// element around it: a construct cannot open directly inside a component tag.
// The wrapper inside the tablist carries role="presentation" so it stays
// transparent and the list still owns the tabs nested under it.
export default function FromData() @{
	const panels = computed(() => [
		{ value: 'alpha', label: 'Alpha', body: 'The first panel.' },
		{ value: 'beta', label: 'Beta', body: 'The second panel.' },
		{ value: 'gamma', label: 'Gamma', body: 'The third panel.' },
	]);

	<section>
		<tabs.root value="alpha" data-testid="root">
			<tabs.list data-testid="list">
				<div role="presentation" data-testid="row-tabs">
					@for (const panel of panels; key panel.value) {
						<tabs.trigger value={panel.value} data-testid="row-trigger">
							{panel.label}
						</tabs.trigger>
					}
				</div>
			</tabs.list>
			<div role="presentation" data-testid="row-panels">
				@for (const panel of panels; key panel.value) {
					<tabs.content value={panel.value} data-testid="row-content">
						{panel.body}
					</tabs.content>
				}
			</div>
		</tabs.root>
	</section>
}
