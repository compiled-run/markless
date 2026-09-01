import { timebox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The day period sits last so ArrowRight from there either stops at the end of
// this embed's segment roster or steps into the next embed's first box.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<timebox.root locale="en-US" name="starts" data-testid="root">
			<timebox.label data-testid="label">Start time</timebox.label>
			<timebox.hourinput data-testid="hour" />
			<timebox.minuteinput data-testid="minute" />
			<timebox.dayperiodinput data-testid="dayperiod" />
			<timebox.field data-testid="field" />
		</timebox.root>
	</section>
}
