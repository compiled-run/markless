import * as drawer from '../index.ts';

// The page behind stays live: no `aria-modal`, so the overlay behaviour leaves
// the background reachable and the document scrollable. Everything else - the
// elevation, the dismissal, the swipe - is unchanged.
export default function NonModal() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root" modal={false}>
			<drawer.trigger data-testid="trigger">Now playing</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<drawer.title data-testid="title">Up next</drawer.title>
					<drawer.close data-testid="close">Hide</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
