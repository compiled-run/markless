import { buttongroup } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. The locked item sits in the middle so the arrow walk has to step
// past it, and `right` is last so ArrowRight from there either stays in this embed
// or lands in the next one's first item.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<buttongroup.root value="left" name="align" data-testid="root">
			<buttongroup.label data-testid="label">Text alignment</buttongroup.label>
			<buttongroup.item value="left" data-testid="left-item">Left</buttongroup.item>
			<buttongroup.item value="justify" disabled data-testid="justify-item">Justify</buttongroup.item>
			<buttongroup.item value="center" data-testid="center-item">Center</buttongroup.item>
			<buttongroup.item value="right" data-testid="right-item">Right</buttongroup.item>
		</buttongroup.root>
	</section>
}
