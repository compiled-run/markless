import { checkbox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. Exactly one box per embed: `checkboxState` is the cell the
// battery counts, and it has to resolve to one definition per island.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<checkbox.root name="terms" data-testid="root">
			<checkbox.trigger data-testid="trigger">
				<checkbox.indicator data-testid="indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="label">I accept the terms of service</checkbox.label>
			<checkbox.description data-testid="description">
				You can withdraw consent from the account page.
			</checkbox.description>
			<checkbox.field data-testid="field" />
		</checkbox.root>
	</section>
}
