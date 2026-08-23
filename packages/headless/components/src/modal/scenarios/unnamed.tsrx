import * as modal from '../index.ts';

// A dialog with neither a title nor a description. The naming references are
// still emitted and resolve to nothing, which is the family's one accepted
// regression against QDS - see note.md.
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
