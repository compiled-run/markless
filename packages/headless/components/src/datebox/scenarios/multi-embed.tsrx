import { datebox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The year sits last so ArrowRight from there either stops at the end of this
// embed's segment roster or steps into the next embed's first box.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<datebox.root name="due" data-testid="root">
			<datebox.label data-testid="label">Due date</datebox.label>
			<datebox.monthinput data-testid="month" />
			<datebox.dayinput data-testid="day" />
			<datebox.yearinput data-testid="year" />
			<datebox.field data-testid="field" />
		</datebox.root>
	</section>
}
