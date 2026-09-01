import { tooltip } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths — which is the point of the shape. Focus is what raises the
// tip with no wait, so the battery's click on the trigger is enough to open it.
export default function MultiEmbed() @{
	<section data-testid="frame" style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root">
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
