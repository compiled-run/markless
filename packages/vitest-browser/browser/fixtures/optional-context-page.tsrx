import { computed } from '@markless/core';
import { OptionalContextFrame } from './optional-context-frame.tsrx';

// T115 regression page (the org-link '#/' stack shape): a client-mounted page
// whose settled @try arm renders a chrome component WITHOUT its optional
// `info` prop. Before the CSR branch-child gating fix, the settle render
// executed the @if arm's child with `info` undefined, threw, and the page
// stayed on its @pending arm forever.
export default function OptionalContextPage() @{
	const model = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 15));
		return { rows: [{ id: 'a', label: 'first entry' }, { id: 'b', label: 'second entry' }] };
	});

	<div data-optional-page>
		@try {
			<OptionalContextFrame>
				<ul>
					@for (const row of model.rows; key row.id) {
						<li data-optional-row>{row.label}</li>
					}
				</ul>
			</OptionalContextFrame>
		} @pending {
			<p data-optional-pending>context loading</p>
		} @catch {
			<p data-optional-fault>context failed</p>
		}
	</div>
}
