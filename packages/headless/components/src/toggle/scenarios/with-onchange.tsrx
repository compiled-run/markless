import { state } from '@markless/core';
import { toggle } from '../../index.ts';

// Three switches with their own consumer handlers: one off, one already on, and
// one nobody may change. Each handler writes into page state the page renders,
// so what the DOM shows is what the consumer's callback was actually called
// with, and how often.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', locked: '', calls: 0 });

	<section>
		<toggle.root
			data-testid="first-root"
			onChange={(next: boolean) => {
				log.first = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<toggle.label data-testid="first-label">Enable notifications</toggle.label>
			<toggle.trigger data-testid="first-trigger"><toggle.thumb data-testid="first-thumb" /></toggle.trigger>
		</toggle.root>
		<toggle.root
			checked
			data-testid="second-root"
			onChange={(next: boolean) => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<toggle.label data-testid="second-label">Weekly digest</toggle.label>
			<toggle.trigger data-testid="second-trigger"><toggle.thumb data-testid="second-thumb" /></toggle.trigger>
		</toggle.root>
		<toggle.root
			disabled
			data-testid="locked-root"
			onChange={(next: boolean) => {
				log.locked = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<toggle.label data-testid="locked-label">Not available on your plan</toggle.label>
			<toggle.trigger data-testid="locked-trigger"><toggle.thumb data-testid="locked-thumb" /></toggle.trigger>
		</toggle.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="locked-value">{log.locked}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
