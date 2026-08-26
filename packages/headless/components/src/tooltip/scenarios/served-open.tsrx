import { tooltip } from '../../index.ts';

// `side="top"` on purpose: the tip is authored after the trigger, so a dead
// anchor leaves it in static flow BELOW the trigger. Only a side whose placement
// differs from static flow can tell a resolved anchor from a silent miss.
export default function ServedOpen() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" open side="top">
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
