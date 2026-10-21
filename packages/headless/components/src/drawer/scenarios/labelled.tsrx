import { drawer } from '../../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// A title and an aria-label both: the title's reference outranks aria-label, so the title names it.
export default function Labelled() @{
	<section>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content aria-label="Filter options" data-testid="content">
					<div style={PANEL}>
						<drawer.title data-testid="title">Narrow these results</drawer.title>
						<drawer.close data-testid="close">Cancel</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
