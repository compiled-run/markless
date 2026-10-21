import { modal } from '../../index.ts';

// A title and an aria-label both: the title's reference outranks aria-label, so the title names it.
export default function Labelled() @{
	<section>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content aria-label="Change where it goes" data-testid="content">
					<modal.title data-testid="title">Edit delivery address</modal.title>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
