import { modal } from '../../index.ts';

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
