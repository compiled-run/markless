import { modal } from '../../index.ts';

// With neither a title nor a description, the naming references are still
// emitted and resolve to nothing.
export default function Unnamed() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Open</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.close data-testid="close">Close</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
