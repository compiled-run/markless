import { drawer } from '../../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// No title part, so the consumer's aria-label is the surface's name.
export default function Fallback() @{
	<section>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content aria-label="Filter options" data-testid="content">
					<div style={PANEL}>
						<drawer.close data-testid="close">Cancel</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
