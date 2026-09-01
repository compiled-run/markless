import { state } from '@markless/core';
import { modal } from '../../index.ts';

// The trigger a real app turns off while its dialog is up, so "Delete" cannot be
// pressed twice. `disabled` is not a family prop; it rides {...rest} onto the
// button, which leaves the family holding a handle to something that can no
// longer take focus by the time the dialog closes.
export default function SpentTrigger() @{
	const page = state({ isOpen: false });

	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root
			data-testid="root"
			open={page.isOpen}
			onChange={(open) => {
				page.isOpen = open;
			}}
		>
			<modal.trigger data-testid="trigger" disabled={page.isOpen}>Delete</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Delete it?</modal.title>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
