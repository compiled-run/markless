import * as popover from '../index.ts';

// With neither a title nor a description, the naming references are still
// emitted and resolve to nothing.
export default function Unnamed() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="root">
			<popover.trigger data-testid="trigger">Open</popover.trigger>
			<popover.content data-testid="content">
				<popover.close data-testid="close">Close</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
