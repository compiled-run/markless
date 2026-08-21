import { progress } from '../index.ts';

// A job that has started but cannot say how far along it is. An unknown amount
// announces no current value at all.
export default function IndeterminateProgress() @{
	<progress.root value={null} data-testid="root">
		<progress.label data-testid="label">Loading...</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
