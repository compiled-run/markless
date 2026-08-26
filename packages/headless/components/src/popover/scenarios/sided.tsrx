import { popover } from '../../index.ts';

// The room around the triggers is the consumer's to give: a surface placed
// against a trigger with nothing above it is kept on screen rather than run off
// the top, so a `top` popover needs somewhere to go.
export default function Sided() @{
	<section style="padding: 200px 40px">
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="end-root" side="end">
			<popover.trigger data-testid="end-trigger">Filters</popover.trigger>
			<popover.content data-testid="end-content">
				<popover.title data-testid="end-title">Filters</popover.title>
				<popover.close data-testid="end-close">Apply</popover.close>
			</popover.content>
		</popover.root>
		<popover.root data-testid="top-root" side="top">
			<popover.trigger data-testid="top-trigger">Sort</popover.trigger>
			<popover.content data-testid="top-content">
				<popover.title data-testid="top-title">Sort</popover.title>
				<popover.close data-testid="top-close">Apply</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
