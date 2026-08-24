import { state } from '@markless/core';
import { modal } from '../../index.ts';

// The dialog opened without a gesture. The ruling allows exactly one
// `modal.trigger` per root, so every other opener is the consumer flipping the
// open state itself - which is what this page's own button does.
export default function Controlled() @{
	const page = state({ isOpen: false });

	<section>
		<button type="button" data-testid="background">Background</button>
		<button
			type="button"
			data-testid="opener"
			onClick={() => {
				page.isOpen = true;
			}}
		>Open from the page</button>
		<button
			type="button"
			data-testid="closer"
			onClick={() => {
				page.isOpen = false;
			}}
		>Close from the page</button>
		<modal.root data-testid="root" open={page.isOpen}>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Session expired</modal.title>
					<modal.close data-testid="close">Sign in again</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
