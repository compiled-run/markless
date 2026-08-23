import * as modal from '../index.ts';

// The starter plus a description, which is the sentence a reader announces after
// the dialog's name.
export default function Described() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Delete project</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Delete this project?</modal.title>
					<modal.description data-testid="description">
						Everything in it goes with it and nobody can put it back.
					</modal.description>
					<modal.close data-testid="close">Keep it</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
