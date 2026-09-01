import { toggle } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. Exactly one switch per embed: `toggleState` is the cell the
// battery counts, and it has to resolve to one definition per island.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<toggle.root name="notifications" data-testid="root">
			<toggle.label data-testid="label">Enable notifications</toggle.label>
			<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
			<toggle.description data-testid="description">
				We will email you when a run finishes.
			</toggle.description>
			<toggle.field data-testid="field" />
		</toggle.root>
	</section>
}
