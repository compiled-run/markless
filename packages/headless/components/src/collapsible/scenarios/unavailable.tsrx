import * as collapsible from '../index.ts';

// Two sections nobody may change: one locked shut, one locked open. A locked
// section still renders its panel and still reports its state; the trigger is
// simply not operable.
export default function Unavailable() @{
	<section>
		<collapsible.root disabled data-testid="shut-root">
			<collapsible.trigger data-testid="shut-trigger">Billing history</collapsible.trigger>
			<collapsible.content data-testid="shut-content">
				Available once your first invoice is issued.
			</collapsible.content>
		</collapsible.root>
		<collapsible.root open disabled data-testid="open-root">
			<collapsible.trigger data-testid="open-trigger">Account owner</collapsible.trigger>
			<collapsible.content data-testid="open-content">
				Only the workspace owner can change this.
			</collapsible.content>
		</collapsible.root>
	</section>
}
