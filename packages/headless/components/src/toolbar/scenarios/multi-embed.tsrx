import { toolbar } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. The bar does
// not wrap, so ArrowRight from the last control moves nothing unless the roster
// merged - in which case it steps straight into the next embed's first control.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<toolbar.root data-testid="root">
			<toolbar.label data-testid="label">Text</toolbar.label>
			<toolbar.item data-testid="bold-item">Bold</toolbar.item>
			<toolbar.item data-testid="italic-item">Italic</toolbar.item>
			<toolbar.item data-testid="underline-item">Underline</toolbar.item>
		</toolbar.root>
	</section>
}
