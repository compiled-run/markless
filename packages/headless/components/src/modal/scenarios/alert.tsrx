import * as modal from '../index.ts';

// An alert dialog. The three deltas the ruling names are all visible here: it
// announces as `alertdialog`, an outside press does not dismiss it, and opening
// it puts focus on the cancel control rather than on the surface. Escape still
// closes it.
export default function Alert() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root alert data-testid="root">
			<modal.trigger data-testid="trigger">Delete account</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Delete this account?</modal.title>
					<modal.description data-testid="description">
						This cannot be undone.
					</modal.description>
					<button type="button" data-testid="confirm">Delete</button>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
