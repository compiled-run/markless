import * as popover from '../index.ts';

export default function Sided() @{
	<section>
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
