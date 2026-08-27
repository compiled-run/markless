import { popover } from '../../index.ts';

// `start` and `end` are the writing direction's sides, so this page is the one
// where they are not left and right.
export default function Rtl() @{
	<section dir="rtl" style="padding: 40px 300px">
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="start-root" side="start" open>
			<popover.trigger data-testid="start-trigger">Filters</popover.trigger>
			<popover.content data-testid="start-content">
				<popover.title data-testid="start-title">Filters</popover.title>
				<popover.close data-testid="start-close">Apply</popover.close>
			</popover.content>
		</popover.root>
		<popover.root data-testid="end-root" side="end" open>
			<popover.trigger data-testid="end-trigger">Sort</popover.trigger>
			<popover.content data-testid="end-content">
				<popover.title data-testid="end-title">Sort</popover.title>
				<popover.close data-testid="end-close">Apply</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
