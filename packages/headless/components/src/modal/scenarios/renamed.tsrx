import { state } from '@markless/core';
import { modal } from '../../index.ts';

// The title's text changes while the dialog is open, and the name has to follow it.
export default function Renamed() @{
	const draft = state({ name: 'Edit delivery address' });

	<section>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">{draft.name}</modal.title>
					<button
						type="button"
						data-testid="rename"
						onClick={() => {
							draft.name = 'Edit billing address';
						}}
					>Rename</button>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
