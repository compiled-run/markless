import { drawer } from '../../index.ts';

// The surface owns its `style` attribute (it carries `--offset`), so a scenario
// gives the drawer a size through something inside it rather than on it.
const PANEL = 'block-size: 320px; inline-size: 320px';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths — which is the point of the shape.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<div data-testid="panel" style={PANEL}>
						<drawer.title data-testid="title">Narrow these results</drawer.title>
						<button type="button" data-testid="apply">Apply</button>
						<drawer.close data-testid="close">Cancel</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
