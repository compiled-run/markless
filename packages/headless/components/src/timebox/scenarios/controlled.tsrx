import { state } from '@markless/core';
import { timebox } from '../../index.ts';

// The time held by the page rather than by the family: the consumer's handler
// writes into page state the page renders, so what the DOM shows is what the
// callback was actually called with, and how often.
export default function Controlled() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<timebox.root
			locale="en-US"
			value="14:30"
			data-testid="root"
			onChange={(next: string | null) => {
				log.value = next === null ? 'null' : next;
				log.calls = log.calls + 1;
			}}
		>
			<timebox.label data-testid="label">Start time</timebox.label>
			<timebox.hourinput data-testid="hourinput" />
			<timebox.minuteinput data-testid="minuteinput" />
			<timebox.dayperiodinput data-testid="dayperiodinput" />
		</timebox.root>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
