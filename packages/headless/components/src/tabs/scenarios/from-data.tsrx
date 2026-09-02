import { computed } from '@markless/core';
import { tabs } from '../../index.ts';

// Tabs authored over a list rather than written out one by one.
//
// The data lives inside the `computed()` because a module-level const read from
// one is not carried into the lowered symbol. The tab loop sits directly under
// the list, so `role="tablist"` owns its tabs with nothing in between.
export default function FromData() @{
	const panels = computed(() => [
		{ value: 'alpha', label: 'Alpha', body: 'The first panel.' },
		{ value: 'beta', label: 'Beta', body: 'The second panel.' },
		{ value: 'gamma', label: 'Gamma', body: 'The third panel.' },
	]);

	<section>
		<tabs.root value="alpha" data-testid="root">
			<tabs.list data-testid="list">
				@for (const panel of panels; key panel.value) {
					<tabs.trigger value={panel.value} data-testid="row-trigger">
						{panel.label}
					</tabs.trigger>
				}
			</tabs.list>
			@for (const panel of panels; key panel.value) {
				<tabs.content value={panel.value} data-testid="row-content">
					{panel.body}
				</tabs.content>
			}
		</tabs.root>
	</section>
}
