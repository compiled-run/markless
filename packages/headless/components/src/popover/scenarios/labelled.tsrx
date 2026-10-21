import { popover } from '../../index.ts';

// A title and an aria-label both: the title's reference outranks aria-label, so the title names it.
export default function Labelled() @{
	<section>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Share</popover.trigger>
			<popover.content aria-label="Share options" data-testid="content">
				<popover.title data-testid="title">Share this page</popover.title>
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
