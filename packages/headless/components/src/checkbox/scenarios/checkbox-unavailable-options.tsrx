import { checkbox } from '../../index.ts';

// Options a person may see but not change: one off and one already on. A
// disabled trigger must not toggle, and the root reports both flags at once.
export default function UnavailableOptions() @{
	<section>
		<checkbox.root disabled data-testid="off-root">
			<checkbox.trigger data-testid="off-trigger">
				<checkbox.indicator data-testid="off-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="off-label">Not available on your plan</checkbox.label>
		</checkbox.root>
		<checkbox.root checked disabled data-testid="on-root">
			<checkbox.trigger data-testid="on-trigger">
				<checkbox.indicator data-testid="on-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="on-label">Always on for your plan</checkbox.label>
		</checkbox.root>
	</section>
}
