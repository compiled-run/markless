import * as modal from '../index.ts';

// A dialog with neither a title nor a description. The APG requires a dialog to
// have a name, so this is a misuse - and the row that renders it is what pins
// what our markup does when the naming parts are absent.
export default function Unnamed() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Open</modal.trigger>
			<modal.content data-testid="content">
				<modal.close data-testid="close">Close</modal.close>
			</modal.content>
		</modal.root>
	</section>
}
