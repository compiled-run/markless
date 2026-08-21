import { progress } from '../../index.ts';

// A wizard on step 20 of 25: the top of the range is the step count, not 100.
export default function StepProgress() @{
	<progress.root value={20} max={25} data-testid="root">
		<progress.label data-testid="label">Custom Max Progress</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
