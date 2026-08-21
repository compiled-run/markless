import { toggle } from '../index.ts';

// Switches a person may see but not change: one off and one already on. A
// disabled trigger must not flip, and the root reports both flags at once.
export default function UnavailableOptions() @{
	<section>
		<toggle.root disabled data-testid="off-root">
			<toggle.label data-testid="off-label">Not available on your plan</toggle.label>
			<toggle.trigger data-testid="off-trigger"><toggle.thumb data-testid="off-thumb" /></toggle.trigger>
		</toggle.root>
		<toggle.root checked disabled data-testid="on-root">
			<toggle.label data-testid="on-label">Always on for your plan</toggle.label>
			<toggle.trigger data-testid="on-trigger"><toggle.thumb data-testid="on-thumb" /></toggle.trigger>
		</toggle.root>
	</section>
}
