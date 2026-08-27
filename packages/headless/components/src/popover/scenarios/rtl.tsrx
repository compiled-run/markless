import { popover } from '../../index.ts';

// The reading-order sides are not left and right on this page, which is what
// makes it the witness for a consumer's `self-inline-*` placement: `self-inline-*`
// reads the surface's own writing direction, while plain `inline-*` reads the
// containing block's and never flips for an out-of-flow surface.
export default function Rtl() @{
	<section dir="rtl" style="padding: 40px 300px">
		<button type="button" data-testid="background">Background</button>
		<popover.root data-testid="start-root" open>
			<popover.trigger data-testid="start-trigger">Filters</popover.trigger>
			<popover.content data-testid="start-content">
				<popover.title data-testid="start-title">Filters</popover.title>
				<popover.close data-testid="start-close">Apply</popover.close>
			</popover.content>
		</popover.root>
		<popover.root data-testid="end-root" open>
			<popover.trigger data-testid="end-trigger">Sort</popover.trigger>
			<popover.content data-testid="end-content">
				<popover.title data-testid="end-title">Sort</popover.title>
				<popover.close data-testid="end-close">Apply</popover.close>
			</popover.content>
		</popover.root>
	</section>
}
