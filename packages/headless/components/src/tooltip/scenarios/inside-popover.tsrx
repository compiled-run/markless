import * as popover from '../../popover/index.ts';
import * as tooltip from '../index.ts';

// A tooltip inside an open popover. Both ride the same overlay stack, and only
// the topmost entry is told about a dismissal.
export default function InsidePopover() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="popover-root">
			<popover.trigger data-testid="popover-trigger">Share</popover.trigger>
			<popover.content data-testid="popover-content">
				<popover.title data-testid="popover-title">Share this page</popover.title>
				<tooltip.root data-testid="root" delay={0}>
					<tooltip.trigger data-testid="trigger">Copy</tooltip.trigger>
					<tooltip.content data-testid="content">Copy the link</tooltip.content>
				</tooltip.root>
			</popover.content>
		</popover.root>
	</section>
}
