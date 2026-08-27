import { state } from '@markless/core';
import { numberbox } from '../../index.ts';

// Two seeded fields with their own consumer handlers, one of them locked. Each
// handler writes into page state the page renders, so what the DOM shows is what
// the callback was actually called with, and how often.
export default function Controlled() @{
	const log = state({ first: '', locked: '', calls: 0 });

	<section>
		<numberbox.root
			value={12}
			data-testid="first-root"
			onChange={(next: number | null) => {
				log.first = next === null ? 'null' : String(next);
				log.calls = log.calls + 1;
			}}
		>
			<numberbox.label data-testid="first-label">Quantity</numberbox.label>
			<numberbox.input data-testid="first-input" />
			<numberbox.forwardtrigger data-testid="first-forwardtrigger">+</numberbox.forwardtrigger>
		</numberbox.root>
		<numberbox.root
			value={12}
			disabled
			data-testid="locked-root"
			onChange={(next: number | null) => {
				log.locked = next === null ? 'null' : String(next);
				log.calls = log.calls + 1;
			}}
		>
			<numberbox.label data-testid="locked-label">Locked quantity</numberbox.label>
			<numberbox.input data-testid="locked-input" />
		</numberbox.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="locked-value">{log.locked}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
