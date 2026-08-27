import { tooltip } from '../../index.ts';

// The icon-only case: the trigger carries its own accessible name and the
// tooltip describes it. No library prop is involved in either.
export default function IconButton() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" delay={0}>
			<tooltip.trigger data-testid="trigger" aria-label="Save">
				<span aria-hidden="true">💾</span>
			</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
