import { popover } from '../../index.ts';

export default function ServedOpen() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="root" open>
			<popover.trigger data-testid="trigger">What's new</popover.trigger>
			<popover.content data-testid="content">
				<popover.title data-testid="title">What's new</popover.title>
				<popover.close data-testid="close">Got it</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
