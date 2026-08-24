import { progress } from '../../index.ts';

export default function Complete() @{
	<progress.root value={100} data-testid="root">
		<progress.label data-testid="label">Complete!</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
