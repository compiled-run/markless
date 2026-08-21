import { checkbox } from '../../index.ts';

// A submitted form that failed validation. Mounting the error part at all is
// what marks the trigger invalid — and it works whether the consumer writes the
// error after the trigger or before it, because seeding is a phase that
// completes before any part renders.
export default function Invalid() @{
	<section>
		<checkbox.root required data-testid="after-root">
			<checkbox.label data-testid="after-label">Accept Terms</checkbox.label>
			<checkbox.description data-testid="after-description">Read our terms and conditions before accepting</checkbox.description>
			<checkbox.trigger data-testid="after-trigger"><checkbox.indicator data-testid="after-indicator">Checked</checkbox.indicator></checkbox.trigger>
			<checkbox.error data-testid="after-error">Please accept the terms and conditions</checkbox.error>
		</checkbox.root>
		<checkbox.root required data-testid="before-root">
			<checkbox.error data-testid="before-error">Please accept the terms and conditions</checkbox.error>
			<checkbox.label data-testid="before-label">Accept Terms</checkbox.label>
			<checkbox.trigger data-testid="before-trigger"><checkbox.indicator data-testid="before-indicator">Checked</checkbox.indicator></checkbox.trigger>
		</checkbox.root>
	</section>
}
