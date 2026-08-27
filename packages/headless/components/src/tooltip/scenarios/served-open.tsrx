import { tooltip } from '../../index.ts';

// The tip is authored after the trigger, so a dead anchor leaves it in static
// flow BELOW the trigger. The family's default puts it ABOVE, and only a
// placement that differs from static flow tells a resolved anchor from a silent
// miss.
export default function ServedOpen() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" open>
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
