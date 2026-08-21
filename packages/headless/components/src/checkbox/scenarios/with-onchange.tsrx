import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

// Two checkboxes with their own consumer handlers. Each handler writes into page
// state the page renders, so what the DOM shows is what the consumer's callback
// was actually called with, and how often.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0 });

	<section>
		<checkbox.root
			data-testid="first-root"
			onChange={(next: boolean | 'mixed') => {
				log.first = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<checkbox.trigger data-testid="first-trigger"><checkbox.indicator data-testid="first-indicator">Checked</checkbox.indicator></checkbox.trigger>
		</checkbox.root>
		<checkbox.root
			checked
			data-testid="second-root"
			onChange={(next: boolean | 'mixed') => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<checkbox.trigger data-testid="second-trigger"><checkbox.indicator data-testid="second-indicator">Checked</checkbox.indicator></checkbox.trigger>
		</checkbox.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
