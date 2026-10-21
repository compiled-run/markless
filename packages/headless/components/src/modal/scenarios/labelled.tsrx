import { modal } from '../../index.ts';

// The title stays the name by reference; the plain-text aria-label is what VoiceOver speaks when the dialog is not directly under <main>.
export default function Labelled() @{
	<section>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content aria-label="Edit delivery address" data-testid="content">
					<modal.title data-testid="title">Edit delivery address</modal.title>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
