import { progress } from '../../index.ts';

// Bars whose range is not the default 0–100: a wizard counting steps, and a gauge
// that does not start at zero.
export default function CustomRange() @{
	<section>
		<progress.root value={20} max={25} data-testid="steps-root">
			<progress.label data-testid="steps-label">Custom Max Progress</progress.label>
			<progress.track data-testid="steps-track"><progress.indicator data-testid="steps-indicator" /></progress.track>
		</progress.root>
		<progress.root value={5000} min={2000} max={10000} data-testid="range-root">
			<progress.label data-testid="range-label">Custom Range Progress</progress.label>
			<progress.track data-testid="range-track"><progress.indicator data-testid="range-indicator" /></progress.track>
		</progress.root>
	</section>
}
