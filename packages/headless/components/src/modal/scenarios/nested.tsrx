import * as modal from '../index.ts';

// A dialog that opens a second dialog. aria-at's own modal fixture is nested, so
// this is the reference-backed shape: Escape has to close only the one on top,
// the first has to be unreachable while the second is showing, and closing the
// second has to put focus back on the button inside the first that opened it.
export default function Nested() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="outer-root">
			<modal.trigger data-testid="outer-trigger">Add delivery address</modal.trigger>
			<modal.content data-testid="outer-content">
				<modal.title data-testid="outer-title">Add delivery address</modal.title>
				<modal.root data-testid="inner-root">
					<modal.trigger data-testid="inner-trigger">Verify address</modal.trigger>
					<modal.content data-testid="inner-content">
						<modal.title data-testid="inner-title">Address added</modal.title>
						<modal.close data-testid="inner-close">OK</modal.close>
					</modal.content>
				</modal.root>
				<modal.close data-testid="outer-close">Cancel</modal.close>
			</modal.content>
		</modal.root>
	</section>
}
