import { state } from '@markless/core';
import { checkbox } from '../../src/index.ts';

// Two checkboxes with their own consumer handlers, and one with none. Each
// handler writes into page state the page renders, so what the DOM shows is
// what the consumer's callback was actually called with, and how often.
export function App() @{
	const log = state({ first: '', second: '', calls: 0 });

	<section data-testid="change">
		<div data-case="first">
			<checkbox.root
				onChange={(next) => {
					log.first = String(next);
					log.calls = log.calls + 1;
				}}
			>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="second">
			<checkbox.root
				checked
				onChange={(next) => {
					log.second = String(next);
					log.calls = log.calls + 1;
				}}
			>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="silent">
			<checkbox.root>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
