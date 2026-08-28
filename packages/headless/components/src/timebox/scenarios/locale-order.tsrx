import { timebox } from '../../index.ts';

// Three locales side by side. Each root reports the order its own locale writes
// the parts in as `ui-order`, which is the one locale fact a consumer has to lay
// out against: Korean puts the AM/PM part first, so it is not always a suffix.
// The family does not reorder the parts itself - the boxes read in the order they
// are written, which is `datebox`'s rule.
export default function LocaleOrder() @{
	<section>
		<timebox.root locale="en-US" value="14:30" data-testid="us-root">
			<timebox.label data-testid="us-label">US</timebox.label>
			<timebox.hourinput data-testid="us-hourinput" />
			<timebox.minuteinput data-testid="us-minuteinput" />
			<timebox.dayperiodinput data-testid="us-dayperiodinput" />
		</timebox.root>
		<timebox.root locale="de-DE" value="14:30" data-testid="de-root">
			<timebox.label data-testid="de-label">DE</timebox.label>
			<timebox.hourinput data-testid="de-hourinput" />
			<timebox.minuteinput data-testid="de-minuteinput" />
		</timebox.root>
		<timebox.root locale="ko-KR" value="14:30" data-testid="ko-root">
			<timebox.label data-testid="ko-label">KO</timebox.label>
			<timebox.dayperiodinput data-testid="ko-dayperiodinput" />
			<timebox.hourinput data-testid="ko-hourinput" />
			<timebox.minuteinput data-testid="ko-minuteinput" />
		</timebox.root>
	</section>
}
