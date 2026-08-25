import * as tooltip from '../index.ts';

// Two tooltips on one page. Each mints its own anchor name and its own id, so
// neither can be placed against the other's trigger or describe the other's
// control.
export default function TwoTooltips() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="first-root" delay={0}>
			<tooltip.trigger data-testid="first-trigger">Copy</tooltip.trigger>
			<tooltip.content data-testid="first-content">Copy the link</tooltip.content>
		</tooltip.root>
		<tooltip.root data-testid="second-root" delay={0}>
			<tooltip.trigger data-testid="second-trigger">Share</tooltip.trigger>
			<tooltip.content data-testid="second-content">Share with your team</tooltip.content>
		</tooltip.root>
	</section>
}
