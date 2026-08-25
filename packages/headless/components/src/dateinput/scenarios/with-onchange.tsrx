import { state } from '@markless/core';
import { dateinput } from '../../index.ts';

// Two dates with their own consumer handlers, one of them locked. Each handler
// writes into page state the page renders, so what the DOM shows is what the
// consumer's callback was actually called with, and how often.
export default function WithOnChange() @{
	const log = state({ first: '', locked: '', calls: 0 });

	<section>
		<dateinput.root
			value="2024-03-30"
			data-testid="first-root"
			onChange={(next: string | null) => {
				log.first = next === null ? 'null' : next;
				log.calls = log.calls + 1;
			}}
		>
			<dateinput.label data-testid="first-label">Start date</dateinput.label>
			<dateinput.monthinput data-testid="first-monthinput" />
			<dateinput.dayinput data-testid="first-dayinput" />
			<dateinput.yearinput data-testid="first-yearinput" />
		</dateinput.root>
		<dateinput.root
			value="2024-03-30"
			disabled
			data-testid="locked-root"
			onChange={(next: string | null) => {
				log.locked = next === null ? 'null' : next;
				log.calls = log.calls + 1;
			}}
		>
			<dateinput.label data-testid="locked-label">Locked date</dateinput.label>
			<dateinput.monthinput data-testid="locked-monthinput" />
			<dateinput.dayinput data-testid="locked-dayinput" />
			<dateinput.yearinput data-testid="locked-yearinput" />
		</dateinput.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="locked-value">{log.locked}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
