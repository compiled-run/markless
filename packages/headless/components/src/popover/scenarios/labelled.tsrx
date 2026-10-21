import { popover } from '../../index.ts';

// The title stays the name by reference; the plain-text aria-label is what VoiceOver speaks when the surface is not directly under <main>.
export default function Labelled() @{
	<section>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Share</popover.trigger>
			<popover.content aria-label="Share this page" data-testid="content">
				<popover.title data-testid="title">Share this page</popover.title>
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
