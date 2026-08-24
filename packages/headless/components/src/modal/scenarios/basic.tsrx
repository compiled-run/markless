import { modal } from '../../index.ts';

// The starter a consumer copies: a button that opens a named dialog, and a
// button inside it that closes it again. The page button outside the dialog is
// what the background-modality rows reach for - it has to become unreachable
// while the dialog is showing and reachable again after it closes.
export default function Basic() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Edit delivery address</modal.title>
					<button type="button" data-testid="save">Save</button>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
