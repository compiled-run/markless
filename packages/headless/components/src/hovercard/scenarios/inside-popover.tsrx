import { hovercard, popover } from '../../index.ts';

// A hover card inside an open popover. Both ride the same overlay stack, and only
// the topmost entry is told about a dismissal.
export default function InsidePopover() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="popover-root">
			<popover.trigger data-testid="popover-trigger">Share</popover.trigger>
			<popover.content data-testid="popover-content">
				<popover.title data-testid="popover-title">Share this page</popover.title>
				<hovercard.root data-testid="root" delay={0}>
					<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
					<hovercard.content data-testid="content">
						<a href="/users/jane" data-testid="card-name">Jane Doe</a>
					</hovercard.content>
				</hovercard.root>
			</popover.content>
		</popover.root>
	</section>
}
