import { state } from '@markless/core';
import { textbox } from '../../index.ts';

// Two fields with their own consumer handlers: a prefilled single-line one and
// an empty multi-line one. Each handler writes into page state the page renders,
// so what the DOM shows is what the consumer's callback was actually called
// with, and how often.
export default function WithOnChange() @{
	const log = state({ single: '', multi: '', calls: 0 });

	<section>
		<textbox.root
			value="ada"
			data-testid="single-root"
			onChange={(next: string) => {
				log.single = next;
				log.calls = log.calls + 1;
			}}
		>
			<textbox.label data-testid="single-label">Name</textbox.label>
			<textbox.input data-testid="single-input" />
		</textbox.root>
		<textbox.root
			data-testid="multi-root"
			onChange={(next: string) => {
				log.multi = next;
				log.calls = log.calls + 1;
			}}
		>
			<textbox.label data-testid="multi-label">Bio</textbox.label>
			<textbox.textarea data-testid="multi-textarea" />
		</textbox.root>
		<p data-testid="single-value">{log.single}</p>
		<p data-testid="multi-value">{log.multi}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
