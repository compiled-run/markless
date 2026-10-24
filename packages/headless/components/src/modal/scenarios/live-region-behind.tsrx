import { modal } from '../../index.ts';

// A disclosure root is a polite live region, and its controls sit inside it.
export default function LiveRegionBehind() @{
	<section>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Edit delivery address</modal.title>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<div aria-live="polite" data-testid="live">
			<button type="button" data-testid="live-button">Show the code</button>
		</div>
		<div aria-live="off" data-testid="quiet">
			<button type="button" data-testid="quiet-button">Copy</button>
		</div>
	</section>
}
