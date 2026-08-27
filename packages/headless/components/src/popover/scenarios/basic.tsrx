import { popover } from '../../index.ts';

export default function Basic() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Share</popover.trigger>
			<popover.content data-testid="content">
				<popover.title data-testid="title">Share this page</popover.title>
				<popover.description data-testid="description">
					Anyone with the link can read it.
				</popover.description>
				<button type="button" data-testid="copy">Copy link</button>
				<popover.close data-testid="close">Done</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
