import { modal } from '../../index.ts';

// No title part, so the consumer's aria-label is the surface's name.
export default function Fallback() @{
	<section>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content aria-label="Change where it goes" data-testid="content">
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
