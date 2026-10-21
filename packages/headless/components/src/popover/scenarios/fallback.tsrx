import { popover } from '../../index.ts';

// No title part, so the consumer's aria-label is the surface's name.
export default function Fallback() @{
	<section>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Share</popover.trigger>
			<popover.content aria-label="Share options" data-testid="content">
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
