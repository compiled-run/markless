import { progress } from '../../index.ts';

// The finished state a consumer leaves on screen when a job is done.
export default function CompleteProgress() @{
	<progress.root value={100} data-testid="root">
		<progress.label data-testid="label">Complete!</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
