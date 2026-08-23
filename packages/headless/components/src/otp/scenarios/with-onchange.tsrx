import { state } from '@markless/core';
import * as otp from '../index.ts';

// The consumer's handlers write what they saw into page state the page renders,
// so what the DOM shows is the argument the callback actually received and how
// many times it ran. `seen` is what `log.value` held when the consumer's own
// `onInput` ran, which is the family's write seen from the composed handler.
export default function WithOnChange() @{
	const log = state({ value: '', calls: 0, typed: 0, seen: '' });

	<section>
		<otp.root
			length={4}
			data-testid="root"
			onChange={(next: string) => {
				log.value = next;
				log.calls = log.calls + 1;
			}}
		>
			<otp.field
				data-testid="field"
				aria-label="Verification code"
				onInput={() => {
					log.typed = log.typed + 1;
					log.seen = log.value;
				}}
			/>
			<otp.item index={0} data-testid="item-0" />
			<otp.item index={1} data-testid="item-1" />
			<otp.item index={2} data-testid="item-2" />
			<otp.item index={3} data-testid="item-3" />
		</otp.root>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="typed">{log.typed}</p>
		<p data-testid="seen">{log.seen}</p>
	</section>
}
