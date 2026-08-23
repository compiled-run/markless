import * as modal from '../index.ts';

// A dialog the server sends already showing. Base UI's dismissal cases all use
// `defaultOpen`, and it is a real consumer shape, so it gets a row of its own -
// the one shape whose surface is never hidden and therefore never flips.
export default function ServedOpen() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root" open>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Accept the terms</modal.title>
					<modal.close data-testid="close">Accept</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
