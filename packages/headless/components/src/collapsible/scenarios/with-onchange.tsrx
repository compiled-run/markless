import { state } from '@markless/core';
import { collapsible } from '../../index.ts';

// Two collapsibles with their own consumer handlers. Each handler writes into
// page state the page renders, so what the DOM shows is what the consumer's
// callback was actually called with, how often, and in what order relative to
// the consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0, order: '' });

	<section>
		<collapsible.root
			data-testid="first-root"
			onChange={(next: boolean) => {
				log.first = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<collapsible.trigger
				data-testid="first-trigger"
				onClick={() => {
					log.order = log.order + '-click';
				}}
			>Shipping</collapsible.trigger>
			<collapsible.content data-testid="first-content">Ships in two days.</collapsible.content>
		</collapsible.root>
		<collapsible.root
			open
			data-testid="second-root"
			onChange={(next: boolean) => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<collapsible.trigger data-testid="second-trigger">Returns</collapsible.trigger>
			<collapsible.content data-testid="second-content">Thirty days, no receipt needed.</collapsible.content>
		</collapsible.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
