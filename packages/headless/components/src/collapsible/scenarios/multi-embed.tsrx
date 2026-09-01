import { collapsible } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. Exactly one panel per embed: `collapsibleState` is the cell the
// battery counts, and it has to resolve to one definition per island.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<collapsible.root data-testid="root">
			<collapsible.trigger data-testid="trigger">
				I have a permit but cannot find a space. What now?
			</collapsible.trigger>
			<collapsible.content data-testid="content">
				Park at the nearest available meter and call the parking office.
			</collapsible.content>
		</collapsible.root>
	</section>
}
